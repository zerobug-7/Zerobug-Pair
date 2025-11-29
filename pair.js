import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);

    await removeFile(dirs);

    // Clean the phone number
    num = num.replace(/[^0-9]/g, '');

    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({ code: '𝐈𝐍𝐕𝐀𝐋𝐈𝐃 𝐩𝐡𝐨𝐧𝐞 𝐧𝐮𝐦𝐛𝐞𝐫. 𝐩𝐥𝐞𝐚𝐬𝐞 𝐞𝐧𝐭𝐞𝐫 𝐲𝐨𝐮𝐫 𝐟𝐮𝐥𝐥 𝐢𝐧𝐭𝐞𝐫𝐧𝐚𝐭𝐢𝐨𝐧𝐚𝐥 𝐧𝐮𝐦𝐛𝐞𝐫 (𝐞.𝐠., 15551234567 𝐟𝐨𝐫 𝐔𝐒, 447911123456 𝐟𝐨𝐫 𝐔𝐊, 𝐞𝐭𝐜.) 𝐰𝐢𝐭𝐡𝐨𝐮𝐭 + 𝐨𝐫 𝐬𝐩𝐚𝐜𝐞𝐬.' });
        }
        return;
    }

    num = phone.getNumber('e164').replace('+', '');

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();

            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
            });

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("Connected successfully!");
                    console.log("Sending session file to user...");

                    try {
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                        // Send session file
                        await KnightBot.sendMessage(userJid, {
                            document: sessionKnight,
                            mimetype: 'application/json',
                            fileName: 'creds.json'
                        });

                        console.log("Session file sent successfully");

                        // Thumbnail message
                        await KnightBot.sendMessage(userJid, {
                            image: { url: 'https://files.catbox.moe/p1eh4e.jpg'' },
                            caption: `*𝐙𝐞𝐫𝐨𝐛𝐮𝐠 𝐒𝐞𝐬𝐬𝐢𝐨𝐧 𝐈𝐝 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲 ⛽️*`
                        });

                        // Warning message
                        await KnightBot.sendMessage(userJid, {
                            text: `*⚠️_𝐃𝐎 𝐍𝐎𝐓 𝐒𝐇𝐀𝐑𝐄  𝐓𝐇𝐈𝐒 𝐅𝐈𝐋𝐄 📁 𝐖𝐈𝐓𝐇 𝐀𝐍𝐘𝐁𝐎𝐃𝐘*\n 
┌┤✑  *𝐓𝐡𝐚𝐧𝐤𝐬 𝐟𝐨𝐫 𝐮𝐬𝐢𝐧𝐠 𝐙𝐞𝐫𝐨𝐛𝐮𝐠*
│└─────────────┈•    
│©2025 𝐍𝐤𝐨𝐬𝐢 𝐓𝐞𝐜𝐡𝐧𝐨𝐥𝐨𝐠𝐲
└─────────────────┈•\n\n`
                        });

                        // Clean session
                        await delay(1000);
                        removeFile(dirs);

                        console.log("Session cleaned successfully");
                    } catch (error) {
                        console.error("Error sending messages:", error);
                        removeFile(dirs);
                    }
                }

                if (isNewLogin) console.log("New login via pair code");
                if (isOnline) console.log("Client is online");

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode === 401) {
                        console.log("Logged out. Need new pair code.");
                    } else {
                        console.log("Reconnecting...");
                        initiateSession();
                    }
                }
            });

            // Pairing code request
            if (!KnightBot.authState.creds.registered) {
                await delay(3000);
                num = num.replace(/[^\d+]/g, '');

                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;

                    if (!res.headersSent) {
                        console.log({ num, code });
                        await res.send({ code });
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) {
                        res.status(503).send({ code: 'Failed to get pairing code.' });
                    }
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);

        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Stream Errored")) return;
    console.log('Caught exception:', err);
});

export default router;
