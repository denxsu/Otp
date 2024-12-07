const TelegramBot = require('node-telegram-bot-api');
var fetch = require("node-fetch");
// Ganti dengan token bot Telegram Anda
const token = '7200880912:AAEJFkp9jNlmEGAf9xtH4oB9YVDJfa-FsTA';
const fs = require('fs');
const delay = require('delay');
const { count } = require('console');
// Inisialisasi bot dengan token
const bot = new TelegramBot(token, {
    polling: true
});

let step = 0;

const userSessions = {};
const orderId = {};


bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🤖 Selamat datang! Silakan masukkan key yang ingin dimasukkan satu. Ketik 'selesai' jika sudah selesai.\n\nCommand:\n\n\`getnumber\` : Untuk mendapatkan nomor\n\`getcode\` : Untuk mendapatkan code\n\`closeorder\` : Untuk close order\n\`successorder\`: Untuk success order\n\`resend\` : Untuk resend sms`, {parse_mode: 'Markdown'});
    step = 1;
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    var text = msg.text;

    if (!userSessions[chatId]) {
        userSessions[chatId] = {};
    }

    // Update sesi dengan pesan terbaru
    userSessions[chatId].lastMessage = msg.text;
    userSessions[chatId].key = userSessions[chatId].key || [];

    if (step === 1) {
        if (text.toLowerCase() == 'selesai') {
            if (userSessions[chatId].key.length > 0) {
                step = 2;
            } else {
                bot.sendMessage(chatId, "⚠️ Anda belum memasukkan key apapun. Silakan masukkan key terlebih dahulu.");
            }
        } else {
            const newAddresses = text.split(/\s+/);
            userSessions[chatId].key.push(...newAddresses);

            var balance = await getBalance(userSessions[chatId].key);

            if (balance == 'BAD_KEY') {
                bot.sendMessage(chatId, "⚠️ Key yang Anda masukkan salah. Silakan masukkan key yang valid.");
                userSessions[chatId].key.pop();
            } else if (balance.match('ACCESS_BALANCE')) {
                bot.sendMessage(chatId, `💰 Key yang Anda masukkan ${userSessions[chatId].key} memiliki saldo ${balance.split(`:`)[1]}.`);
                step = 2;
            }
        }
    } else if (step === 2) {
        var balance = await getBalance(userSessions[chatId].key);
        if (balance == 'BAD_KEY') {
            bot.sendMessage(chatId, "⚠️ Key yang Anda masukkan salah. Silakan masukkan key yang valid.");
            userSessions[chatId].key.pop();
        } else if (balance.match('ACCESS_BALANCE')) {
            bot.sendMessage(chatId, `✔️ Anda telah memasukkan Key : \`${userSessions[chatId].key}\` dan memiliki saldo ${balance.split(`:`)[1]}.`, {parse_mode: 'Markdown'});
            await delay(1000)
            var text = msg.text;

            if (text.toLowerCase() === 'getnumber') {
                bot.sendMessage(chatId, "📱 Masukkan service, operator, dan country. Contoh: service=go, operator=any, country=any");
                step = 3;
            } else if(text.toLowerCase() == 'getcode') {
                bot.sendMessage(chatId, "📱 Masukkan order ID untuk mendapatkan kode verifikasi.");
                step = 4;
            } else if(text.toLowerCase() == 'successorder') {
                bot.sendMessage(chatId, "📱 Masukkan order ID untuk menyelesaikan order.");
                step = 5;
            } else if(text.toLowerCase() == 'closeorder') {
                bot.sendMessage(chatId, "📱 Masukkan order ID untuk menutup order.");
                step = 6;
            } else if(text.toLowerCase() == 'resend') {
                bot.sendMessage(chatId, "📱 Masukkan order ID untuk diresend.");
                step = 7;
            }
        }

    } else if (step == 3) {
        awal: while (true) {
            const [service, operator, country] = text.split(/\s*,\s*/).map((item) => item.split(/\s*=\s*/)[1]);
            var number = await getNumber(userSessions[chatId].key, service, operator, country);
            const serviceName = findServiceName(service);
            const countryName = findCountry(country)
            if (number.match('BAD_SERVICE')) {
                bot.sendMessage(chatId, "⚠️ Service yang Anda masukkan salah. Silakan masukkan service yang valid.");
                step = 2;
                break;
            } else if (number.match('ACCESS_NUMBER')) {
                bot.sendMessage(chatId, `📱 Nomor yang Anda dapatkan adalah \`${number.split(`:`)[2]}\`. Order ID \`${number.split(`:`)[1]}\`. Service ${serviceName}. Negara ${countryName}`, {
                    parse_mode: `Markdown`
                });
                step = 2;
                break;
            } else if (number.match('NO_NUMBERS')) {
                bot.sendMessage(chatId, "⚠️ Nomor tidak tersedia. Bot akan mencoba sampai mendapatkan nomor.");
                step = 2;
                continue awal;
            }
        }
    } else if (step == 4) {
        var code = await getCode(userSessions[chatId].key, text);
        if (code.match('STATUS_OK')) {
            bot.sendMessage(chatId, `🔑 Kode verifikasi adalah \`${code.split(`:`)[1]}\`.`, {
                parse_mode: `Markdown`
            });
            step = 2;
        } else if (code.match('STATUS_WAIT')) {
            bot.sendMessage(chatId, "⏳ Kode verifikasi belum diterima.");
            step = 2;
        } else if (code.match('STATUS_CANCEL')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan status cancel. Silakan masukkan order ID yang valid.");
            step = 2;
        } else if (code.match('BAD_KEY')) {
            bot.sendMessage(chatId, "⚠️ Key yang Anda masukkan salah. Silakan masukkan key yang valid.");
            step = 2;
        }
    } else if(step == 5) {
        var success = await successorder(userSessions[chatId].key, text);
        if (success.match('ACCESS_ACTIVATION')) {
            bot.sendMessage(chatId, `🔑 Order ID \`${text}\` berhasil diselesaikan.`, {
                parse_mode: `Markdown`
            });
            step = 2;
        } else if (success.match('STATUS_WAIT')) {
            bot.sendMessage(chatId, "⏳ Order ID belum berhasil diselesaikan. Bot akan mencoba sampai berhasil.");
            step = 2;
        } else if (success.match('STATUS_CANCEL')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan status cancel. Silakan masukkan order ID yang valid.");
            step = 2;
        } else if (success.match('WRONG_ACTIVATION_ID')) {
            bot.sendMessage(chatId, "⚠️ Key yang Anda masukkan salah. Silakan masukkan key yang valid.");
            step = 2;
        } else {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan berhasil ditutup.");
            step = 2;
        }
    } else if(step == 6) {
        var close = await closeOrder(userSessions[chatId].key, text);
        if (close.match('STATUS_OK')) {
            bot.sendMessage(chatId, `🔑 Order ID \`${text}\` berhasil ditutup.`, {
                parse_mode: `Markdown`
            });
            step = 2;
        } else if (close.match('STATUS_WAIT')) {
            bot.sendMessage(chatId, "⏳ Order ID belum berhasil ditutup. Bot akan mencoba sampai berhasil.");
            step = 2;
        } else if (close.match('STATUS_CANCEL')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan status cancel. Silakan masukkan order ID yang valid.");
            step = 2;
        } else if (close.match('BAD_KEY')) {
            bot.sendMessage(chatId, "⚠️ Key yang Anda masukkan salah. Silakan masukkan key yang valid.");
            step = 2;
        } else if(close.match('ALREADY_CANCELED')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan sudah ditutup.");
            step = 2;
        } else if(close.match('ACCESS_CANCEL')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan berhasil ditutup.");
            step = 2;
        } else if(close.match('WRONG_ACTIVATION_ID')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan salah. Silakan masukkan order ID yang valid.");
            step = 2;
        }
    } else if(step == 7) {
        var resend = await resendOrder(userSessions[chatId].key, text);
        if(resend.match('ACCESS_RETRY_GET')) {
            bot.sendMessage(chatId, `🔑 Order ID \`${text}\` berhasil diresend.`, {
                parse_mode: `Markdown`
            });
            step = 2;
        } else if (resend.match('STATUS_WAIT')) {
            bot.sendMessage(chatId, "⏳ Order ID belum berhasil ditutup. Bot akan mencoba sampai berhasil.");
            step = 2;
        } else if (resend.match('STATUS_CANCEL')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan status cancel. Silakan masukkan order ID yang valid.");
            step = 2;
        } else if (resend.match('BAD_KEY')) {
            bot.sendMessage(chatId, "⚠️ Key yang Anda masukkan salah. Silakan masukkan key yang valid.");
            step = 2;
        } else if(resend.match('ALREADY_CANCELED')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan sudah ditutup.");
            step = 2;
        } else if(resend.match('ACCESS_CANCEL')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan berhasil ditutup.");
            step = 2;
        } else if(close.match('WRONG_ACTIVATION_ID')) {
            bot.sendMessage(chatId, "⚠️ Order ID yang Anda masukkan salah. Silakan masukkan order ID yang valid.");
            step = 2;
        }
    }
});

function getBalance(apikey) {
    const index = fetch('https://smshub.org/stubs/handler_api.php?api_key=' + apikey + '&action=getBalance', {})

        .then(async (res) => {
            var data = res.text();
            return data;
        });
    return index
}

function findCountry(country) {
    const listServices = fs.readFileSync('listCountryAndOperators.txt', 'utf8');
    const lines = listServices.split('\n');
    for (const line of lines) {
        const [code, name] = line.split('\t');
        if (code === country) {
            return name;
        }
    }
    return 'Country not found';
}

function findServiceName(serviceCode) {
    const listServices = fs.readFileSync('listServices.txt', 'utf8');
    const lines = listServices.split('\n');
    for (const line of lines) {
        const [code, name] = line.split('\t');
        if (code === serviceCode) {
            return name;
        }
    }
    return 'Service not found';
}

function getNumber(apikey, service, operator, country) {
    const index = fetch('https://smshub.org/stubs/handler_api.php?api_key=' + apikey + '&action=getNumber&service=' + service + '&operator=' + operator + '&country=' + country + '', {})

        .then(async (res) => {
            var data = res.text();
            return data;
        });
    return index
}

function getCode(apikey, orderid) {
    const index = fetch('https://smshub.org/stubs/handler_api.php?api_key=' + apikey + '&action=getStatus&id=' + orderid + '', {})

        .then(async (res) => {
            var data = res.text();
            return data;
        });
    return index
}

function successorder(apikey, orderid) {
    const index = fetch('https://smshub.org/stubs/handler_api.php?api_key=' + apikey + '&action=setStatus&status=6&id=' + orderid + '', {})

        .then(async (res) => {
            var data = res.text();
            return data;
        });
    return ƒ
}

function closeOrder(apikey, orderid) {
    const index = fetch('https://smshub.org/stubs/handler_api.php?api_key=' + apikey + '&action=setStatus&status=8&id=' + orderid + '', {})

        .then(async (res) => {
            var data = res.text();
            return data;
        });
    return index
}

function resendOrder(apikey, orderid) {
    const index = fetch('https://smshub.org/stubs/handler_api.php?api_key=' + apikey + '&action=setStatus&status=3&id=' + orderid + '', {})

        .then(async (res) => {
            var data = res.text();
            return data;
        });
    return index
}