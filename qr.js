import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

const router = express.Router();

// Function to remove files or directories
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    // Generate unique session for each request to avoid conflicts
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;

    // Ensure qr_sessions directory exists
    if (!fs.existsSync('./qr_sessions')) {
        fs.mkdirSync('./qr_sessions', { recursive: true });
    }

    async function initiateSession() {
        // ✅ PERMANENT FIX: Create the session folder before anything
        if (!fs.existsSync(dirs)) fs.mkdirSync(dirs, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            
            let qrGenerated = false;
            let responseSent = false;

            // QR Code handling logic
            const handleQRCode = async (qr) => {
                if (qrGenerated || responseSent) return;
                
                qrGenerated = true;
                console.log('🟢 𝐐𝐑 𝐂𝐨𝐝𝐞 𝐆𝐞𝐧𝐞𝐫𝐚𝐭𝐞𝐝! 𝐒𝐜𝐚𝐧 𝐢𝐭 𝐰𝐢𝐭𝐡 𝐲𝐨𝐮𝐫 𝐖𝐡𝐚𝐭𝐬𝐀𝐩𝐩 𝐚𝐩𝐩.');
                console.log('📋 𝐈𝐧𝐬𝐭𝐫𝐮𝐜𝐭𝐢𝐨𝐧𝐬:');
                console.log('1. 𝐎𝐩𝐞𝐧 𝐖𝐡𝐚𝐭𝐬𝐀𝐩𝐩 𝐨𝐧 𝐲𝐨𝐮𝐫 𝐩𝐡𝐨𝐧𝐞');
                console.log('2. 𝐆𝐨 𝐭𝐨 𝐒𝐞𝐭𝐭𝐢𝐧𝐠𝐬 > 𝐋𝐢𝐧𝐤𝐞𝐝 𝐃𝐞𝐯𝐢𝐜𝐞𝐬');
                console.log('3. 𝐓𝐚𝐩 "𝐋𝐢𝐧𝐤 𝐚 𝐃𝐞𝐯𝐢𝐜𝐞"');
                console.log('4. 𝐒𝐜𝐚𝐧 𝐭𝐡𝐞 𝐐𝐑 𝐜𝐨𝐝𝐞 𝐛𝐞𝐥𝐨𝐰');
                // Display QR in terminal
                //qrcodeTerminal.generate(qr, { small: true });
                try {
                    // Generate QR code as data URL
                    const qrDataURL = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'M',
                        type: 'image/png',
                        quality: 0.92,
                        margin: 1,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    });

                    if (!responseSent) {
                        responseSent = true;
                        console.log('QR Code generated successfully');
                        await res.send({ 
                            qr: qrDataURL, 
                            message: '𝐐𝐑 𝐂𝐨𝐝𝐞 𝐆𝐞𝐧𝐞𝐫𝐚𝐭𝐞𝐝! 𝐒𝐜𝐚𝐧 𝐢𝐭 𝐰𝐢𝐭𝐡 𝐲𝐨𝐮𝐫 𝐖𝐡𝐚𝐭𝐬𝐀𝐩𝐩 𝐚𝐩𝐩.',
                            instructions: [
                                '1. 𝐎𝐏𝐄𝐍 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐎𝐍 𝐘𝐎𝐔𝐑 𝐏𝐇𝐎𝐍𝐄',
                                '2. 𝐆𝐎 𝐓𝐎 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 > 𝐋𝐈𝐍𝐊𝐄𝐃 𝐃𝐄𝐕𝐈𝐂𝐄𝐒',
                                '3. 𝐓𝐀𝐏 "𝐋𝐈𝐍𝐊 𝐀 𝐃𝐄𝐕𝐈𝐂𝐑"',
                                '4. 𝐒𝐂𝐀𝐍 𝐓𝐇𝐄 𝐐𝐑 𝐂𝐎𝐃𝐄 𝐀𝐁𝐎𝐕𝐄'
                            ]
                        });
                    }
                } catch (qrError) {
                    console.error('Error generating QR code:', qrError);
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).send({ code: 'Failed to generate QR code' });
                    }
                }
            };

            // Improved Baileys socket configuration
            const socketConfig = {
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Chrome'), // Using Browsers enum for better compatibility
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: false, // Disable to reduce connection issues
                generateHighQualityLinkPreview: false, // Disable to reduce connection issues
                defaultQueryTimeoutMs: 60000, // Increase timeout
                connectTimeoutMs: 60000, // Increase connection timeout
                keepAliveIntervalMs: 30000, // Keep connection alive
                retryRequestDelayMs: 250, // Retry delay
                maxRetries: 5, // Maximum retries
            };

            // Create socket and bind events
            let sock = makeWASocket(socketConfig);
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 3;

            // Connection event handler function
            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log(`🔄 Connection update: ${connection || 'undefined'}`);

                if (qr && !qrGenerated) {
                    await handleQRCode(qr);
                }

                if (connection === 'open') {
                    console.log('✅ Connected successfully!');
                    console.log('💾 Session saved to:', dirs);
                    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                    
                    try {
                        
                        
                        // Read the session file
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');
                        
                        // Get the user's JID from the session
                        const userJid = Object.keys(sock.authState.creds.me || {}).length > 0 
                            ? jidNormalizedUser(sock.authState.creds.me.id) 
                            : null;
                            
                        if (userJid) {
                            // Send session file to user
                            await sock.sendMessage(userJid, {
                                document: sessionKnight,
                                mimetype: 'application/json',
                                fileName: 'creds.json'
                            });
                            console.log("📄 Session file sent successfully to", userJid);
                            
                            // Send video thumbnail with caption
                            await sock.sendMessage(userJid, {
                                image: { url: 'https://files.catbox.moe/p1eh4e.jpg' },
                            caption: `*𝐙𝐞𝐫𝐨𝐛𝐮𝐠 𝐒𝐞𝐬𝐬𝐢𝐨𝐧 𝐈𝐝 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲 ⛽️*`
                        });
                        console.log("𝐙𝐞𝐫𝐨𝐛𝐮𝐠 𝐒𝐞𝐬𝐬𝐢𝐨𝐧 𝐈𝐝 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲y");

                        // Send warning message
                        await Zerobug.sendMessage(userJid, {
                            text: `*⚠️_𝐃𝐎 𝐍𝐎𝐓 𝐒𝐇𝐀𝐑𝐄  𝐓𝐇𝐈𝐒 𝐅𝐈𝐋𝐄 📁 𝐖𝐈𝐓𝐇 𝐀𝐍𝐘𝐁𝐎𝐃𝐘*\n 
┌┤✑  *𝐓𝐡𝐚𝐧𝐤𝐬 𝐟𝐨𝐫 𝐮𝐬𝐢𝐧𝐠 𝐙𝐞𝐫𝐨𝐛𝐮𝐠*
│└─────────────┈•    
│©2025 𝐍𝐤𝐨𝐬𝐢 𝐓𝐞𝐜𝐡𝐧𝐨𝐥𝐨𝐠𝐲
└─────────────────┈•\n\n`
                            });
                        } else {
                            console.log("❌ Could not determine user JID to send session file");
                        }
                    } catch (error) {
                        console.error("Error sending session file:", error);
                    }
                    
                    // Clean up session after successful connection and sending files
                    setTimeout(() => {
                        console.log('🧹 Cleaning up session...');
                        const deleted = removeFile(dirs);
                        if (deleted) {
                            console.log('✅ Session cleaned up successfully');
                        } else {
                            console.log('❌ Failed to clean up session folder');
                        }
                    }, 15000); // Wait 15 seconds before cleanup to ensure messages are sent
                }

                if (connection === 'close') {
                    console.log('❌ Connection closed');
                    if (lastDisconnect?.error) {
                        console.log('❗ Last Disconnect Error:', lastDisconnect.error);
                    }
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    // Handle specific error codes
                    if (statusCode === 401) {
                        console.log('🔐 Logged out - need new QR code');
                        removeFile(dirs);
                    } else if (statusCode === 515 || statusCode === 503) {
                        console.log(`🔄 Stream error (${statusCode}) - attempting to reconnect...`);
                        reconnectAttempts++;
                        
                        if (reconnectAttempts <= maxReconnectAttempts) {
                            console.log(`🔄 Reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
                            // Wait a bit before reconnecting
                            setTimeout(() => {
                                try {
                                    sock = makeWASocket(socketConfig);
                                    sock.ev.on('connection.update', handleConnectionUpdate);
                                    sock.ev.on('creds.update', saveCreds);
                                } catch (err) {
                                    console.error('Failed to reconnect:', err);
                                }
                            }, 2000);
                        } else {
                            console.log('❌ Max reconnect attempts reached');
                            if (!responseSent) {
                                responseSent = true;
                                res.status(503).send({ code: 'Connection failed after multiple attempts' });
                            }
                        }
                    } else {
                        console.log('🔄 Connection lost - attempting to reconnect...');
                        // Let it reconnect automatically
                    }
                }
            };

            // Bind the event handler
            sock.ev.on('connection.update', handleConnectionUpdate);

            sock.ev.on('creds.update', saveCreds);

            // Set a timeout to clean up if no QR is generated
            setTimeout(() => {
                if (!responseSent) {
                    responseSent = true;
                    res.status(408).send({ code: 'QR generation timeout' });
                    removeFile(dirs);
                }
            }, 30000); // 30 second timeout

        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
            removeFile(dirs);
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("Stream Errored (restart required)")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export default router;