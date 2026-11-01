import fs from "fs";
import path from "path";

const START_URL = "https://url24.link/AtomSporTV";
const OUTPUT_FOLDER = "streams3";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  Referer: "https://url24.link/",
};

const M3U8_HEADER = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5500000,AVERAGE-BANDWIDTH=8976000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",FRAME-RATE=25`;

async function fetchNoRedirect(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "manual",
  });
  return res;
}

async function getBaseDomain() {
  const fallback = "https://atomsportv519.top";

  let currentUrl = START_URL;
  let referer = HEADERS.Referer;

  try {
    // Follow redirects manually so we can identify the failing URL.
    for (let i = 0; i < 10; i++) {
      console.log(`Requesting: ${currentUrl}`);

      let response;

      try {
        response = await fetch(currentUrl, {
          headers: {
            ...HEADERS,
            Referer: referer,
          },
          redirect: "manual",
        });
      } catch (e) {
        const cause = e.cause;

        throw new Error(
          `Request failed at ${currentUrl}\n` +
          `Cause: ${cause?.code ?? ""} ${cause?.message ?? e.message}`
        );
      }

      const location = response.headers.get("location");

      if (
        response.status >= 300 &&
        response.status < 400 &&
        location
      ) {
        referer = currentUrl;
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} at ${currentUrl}`
        );
      }

      const html = await response.text();

      const match = html.match(
        /fetch\s*\(\s*(["'])(https?:\/\/[^/"']+)\/load\/channels\.php(?:\?[^"']*)?\1\s*\)/i
      );

      if (match) {
        console.log("Detected base domain:", match[2]);
        return match[2];
      }

      console.warn(
        `The expected fetch() pattern was not found in ${currentUrl}`
      );

      break;
    }

    console.warn("Using fallback domain:", fallback);
    return fallback;
  } catch (e) {
    console.error("Failed to detect base domain:", e.message);
    console.warn("Using fallback domain:", fallback);
    return fallback;
  }
}

async function getChannelM3u8(channelId, baseDomain) {
  try {
    const matchesUrl = `${baseDomain}/load/yayinlink.php?id=${channelId}`;
    
    const response = await fetch(matchesUrl, {
      headers: HEADERS,
    });

    if (!response.ok) {
      console.warn(`${channelId}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (
      typeof data.deismackanal === "string" &&
      data.deismackanal.trim()
    ) {
      return data.deismackanal.trim();
    }

    console.warn(`${channelId}: Missing deismackanal field`);
    return null;
  } catch (e) {
    console.warn(`${channelId}: ${e.message}`);
    return null;
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER);
  }

  const baseDomain = await getBaseDomain();

  const mainChannels = [
    { id: "bein-sports-1" },
    { id: "bein-sports-2" },
    { id: "bein-sports-3" },
    { id: "bein-sports-4" },
    { id: "bein-sports-5" },
    { id: "bein-sports-max-1" },
    { id: "bein-sports-max-2" },
    { id: "s-sport" },
    { id: "s-sport-2" },
    { id: "tivibu-spor" },
    { id: "tivibu-spor-1" },
    { id: "tivibu-spor-2" },
    { id: "tivibu-spor-3" },
    { id: "trt-spor" },
    { id: "trt-yildiz" },
    { id: "trt-1" },
    { id: "a-spor" }
  ];

  const tabiiList = [
    "tabii",
    "tabii1",
    "tabii2",
    "tabii3",
    "tabii4",
    "tabii5",
    "tabii6",
  ];

  let templateUrl = null;

  console.log("Scanning streams...");

  for (const ch of mainChannels) {
    const url = await getChannelM3u8(ch.id, baseDomain);

    if (url) {
      if (!templateUrl) templateUrl = url;

      const filePath = path.join(OUTPUT_FOLDER, `${ch.id}.m3u8`);
      fs.writeFileSync(filePath, `${M3U8_HEADER}\n${url}`);

      console.log(`Saved ${ch.id}`);
    } else {
      console.log(`No stream found for ${ch.id}`);
    }
  }

  if (templateUrl) {
    const parts = templateUrl.split("/");
    const baseHlsUrl = parts.slice(0, -1).join("/");

    for (const tId of tabiiList) {
      const finalUrl = `${baseHlsUrl}/${tId}.m3u8`;

      const filePath = path.join(OUTPUT_FOLDER, `${tId}.m3u8`);
      fs.writeFileSync(filePath, `${M3U8_HEADER}\n${finalUrl}`);

      console.log(`${tId}.m3u8 -> Stream: ${tId}.m3u8`);
    }
  } else {
    console.warn("No template stream found; skipping tabii streams.");
  }
}

main();
