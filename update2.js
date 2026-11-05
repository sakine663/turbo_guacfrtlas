import fs from "fs";
import path from "path";

// SSL sertifika hatalarını yok say (Python'daki verify=False karşılığı)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

const M3U8_HEADER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5500000,AVERAGE-BANDWIDTH=8976000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",FRAME-RATE=25`;

const OUTPUT_FOLDER = "streams2";
const BASE_PATTERN = "https://mahsunsports{}.xyz";

const CHANNELS = [
    "androstreamlivebiraz1", "androstreamlivebs1", "androstreamlivebs2", "androstreamlivebs3",
    "androstreamlivebs4", "androstreamlivebs5", "androstreamlivebsm1", "androstreamlivebsm2",
    "androstreamlivess1", "androstreamlivess2", "androstreamlivessplus1", "androstreamliveidm", "androstreamlivecbcs", "androstreamlivessplus2", "androstreamlivets", "androstreamlivets1",
    "androstreamlivets2", "androstreamlivets3", "androstreamlivets4", "androstreamlivesm1",
    "androstreamlivesm2", "androstreamlivees1", "androstreamlivees2", "androstreamlivetb",
    "androstreamlivetb1", "androstreamlivetb2", "androstreamlivetb3", "androstreamlivetb4",
    "androstreamlivetb5", "androstreamlivetb6", "androstreamlivetb7", "androstreamlivetb8",
    "androstreamliveexn", "androstreamliveexn1", "androstreamliveexn2", "androstreamliveexn3",
    "androstreamliveexn4", "androstreamliveexn5", "androstreamliveexn6", "androstreamliveexn7",
    "androstreamliveexn8"
];

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        return null;
    }
}

async function checkDomain(index) {
    const url = BASE_PATTERN.replace("{}", index);
    try {
        const res = await fetchWithTimeout(url, { headers: HEADERS, redirect: 'follow' }, 5000);
        if (res && res.ok) return url;
    } catch (e) {}
    return null;
}

async function main() {
    // Klasör yoksa oluştur
    if (!fs.existsSync(OUTPUT_FOLDER)) {
        fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
    }

    console.log("🔍 Andro Panel aktif domaini aranıyor (12-99 arası)...");

    // 12-99 arası domainleri 2'şerli/20'şerli gruplar halinde hızlıca tara
    let activeSite = null;
    const indices = [];
    for (let i = 12; i < 100; i++) indices.push(i);

    const batchSize = 20;
    for (let i = 0; i < indices.length; i += batchSize) {
        const batch = indices.slice(i, i + batchSize);
        const promises = batch.map(index => checkDomain(index));
        const results = await Promise.all(promises);
        const found = results.find(r => r !== null);
        if (found) {
            activeSite = found;
            break;
        }
    }

    if (!activeSite) {
        console.log("❌ 12 ile 99 arasında aktif site bulunamadı.");
        return;
    }

    console.log(`✅ Güncel domain bulundu: ${activeSite}`);

    // 2. Event sayfasından sunucuları (baseurls) çek
    const eventUrl = `${activeSite}/event.html?id=androstreamlivebs1`;
    console.log("⚙️ Sunucu listesi çekiliyor...");

    const r2 = await fetchWithTimeout(eventUrl, { headers: HEADERS }, 10000);
    if (!r2 || !r2.ok) {
        console.log("❌ Event sayfası alınamadı.");
        return;
    }
    const h2Text = await r2.text();

    const baseurlMatch = h2Text.match(/baseurls\s*=\s*\[(.*?)\]/is);
    if (!baseurlMatch) {
        console.log("❌ baseurls dizisi event sayfasında bulunamadı.");
        return;
    }

    const urlsText = baseurlMatch[1].replace(/["']/g, "").replace(/[\n\r]/g, "");
    const servers = [...new Set(urlsText.split(',').map(url => url.trim()).filter(url => url.startsWith("http")))];

    if (servers.length === 0) {
        console.log("❌ Aktif sunucu URL'si ayıklanamadı.");
        return;
    }

    // 3. Çekilen sunuculardan çalışanını test et
    console.log("⚡ Çalışan sunucu test ediliyor...");
    let activeServer = null;
    const testId = "androstreamlivebs1";

    for (let server of servers) {
        server = server.replace(/\/+$/, '');
        let testUrl = server.includes("checklist") 
            ? `${server}/${testId}.m3u8` 
            : `${server}/checklist/${testId}.m3u8`;
        testUrl = testUrl.replace("checklist//", "checklist/");

        try {
            const tempRes = await fetchWithTimeout(testUrl, {
                headers: { 'Referer': activeSite + '/' }
            }, 5000);

            if (tempRes && tempRes.ok) {
                activeServer = server;
                break;
            }
        } catch (e) {}
    }

    if (!activeServer) {
        console.log("❌ Çalışan alt sunucu (m3u8 kaynağı) bulunamadı.");
        return;
    }

    console.log(`🎯 Aktif yayın sunucusu: ${activeServer}`);
    console.log(`📂 Dosyalar '${OUTPUT_FOLDER}' klasörüne yazılıyor...\n`);

    // 4. Kanalları klasör içine kaydet
    let count = 0;
    for (const cid of CHANNELS) {
        let furl = activeServer.includes("checklist")
            ? `${activeServer}/${cid}.m3u8`
            : `${activeServer}/checklist/${cid}.m3u8`;
        furl = furl.replace("checklist//", "checklist/");

        const fileContent = `${M3U8_HEADER}\n${furl}`;
        const filePath = path.join(OUTPUT_FOLDER, `${cid}.m3u8`);
        
        fs.writeFileSync(filePath, fileContent, "utf-8");
        count++;
    }

    console.log(`🏁 İşlem Tamamlandı! Toplam ${count} adet .m3u8 dosyası güncellendi.`);
}

main();
