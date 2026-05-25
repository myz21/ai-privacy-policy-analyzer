// test-url-finder.js

// content.ts içindeki mantığın aynısı
const findPrivacyPolicyUrl = (urls) => {
    // Aynı URL'leri temizle (duplicate kontrolü)
    const uniqueUrls = [...new Set(urls)];

    const patterns = [
      /privacy-policy\b/i, // highest priority
      /\bprivacy\/policy\b/i,
      /privacy-policy-[a-z]+/i,
      /\bpolicy\/privacy\b/i,
      /\bprivacy\b/i,
      /\bdata-protection\b/i,
      /\bsecurity-policy\b/i,
      /\blegal-notice\b/i,
      /\bcookie-policy\b/i,
      /\bterms-of-service\b/i,
      /\bterms-and-conditions\b/i,
      /\bterms\b/i,
      /\bcompliance\b/i,
      /\bdisclaimer\b/i,
      /\blegal\b/i,
    ];
  
    // Log matching process for debugging
    const scoredMatches = uniqueUrls
      .map(url => {
        const index = patterns.findIndex(regex => regex.test(url));
        return { url, score: index === -1 ? Infinity : index };
      })
      .filter(({ score }) => score < Infinity)
      .sort((a, b) => a.score - b.score);

    if (scoredMatches.length > 0) {
        console.log("Matched Candidates:");
        scoredMatches.slice(0, 5).forEach(m => console.log(` [Score ${m.score}] ${m.url}`));
    }

    return scoredMatches.length > 0 ? scoredMatches[0].url : "No match found";
  };
  
  // Node.js ortamında fetch API'si (Node 18+ ile yerleşik gelir, yoksa 'node-fetch' gerekir)
// Basitlik adına regex ile linkleri bulacağız
const https = require('https');

const fetchUrlContent = (url, redirectCount = 0) => {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };

        https.get(url, options, (res) => {
            // Yönlendirme (301, 302, 307, 308) kontrolü
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                console.log(`Redirecting to: ${res.headers.location}`);
                // Göreli path varsa düzelt
                const nextUrl = new URL(res.headers.location, url).href;
                return fetchUrlContent(nextUrl, redirectCount + 1).then(resolve).catch(reject);
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
};

const extractLinks = (html, baseUrl) => {
    const linkRegex = /href=["']([^"']+)["']/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        let href = match[1];
        try {
             // Göreli linkleri tam URL'e çevir
            const fullUrl = new URL(href, baseUrl).href;
            if (fullUrl.startsWith('http')) {
                links.push(fullUrl);
            }
        } catch (e) {
            // Geçersiz URL'leri atla
        }
    }
    return links;
};

// Ana çalıştırma mantığı
(async () => {
    let targetUrl = process.argv[2];

    if (!targetUrl) {
        console.log("Usage: node test-url-finder.js <url>");
        console.log("Example: node test-url-finder.js tiktok.com");
        process.exit(1);
    }

    // Protokol ekle (eğer yoksa)
    if (!targetUrl.match(/^https?:\/\//)) {
        targetUrl = 'https://' + targetUrl;
    }

    console.log(`\nfetching content from: ${targetUrl}...`);
    
    try {
        const html = await fetchUrlContent(targetUrl);
        const links = extractLinks(html, targetUrl);
        
        console.log(`Found ${links.length} links on the page.`);
        
        const bestMatch = findPrivacyPolicyUrl(links);
        
        console.log("\n---------------------------");
        if (bestMatch === "No match found") {
             console.log("❌ No privacy policy link found.");
        } else {
             console.log(`🏆 Best Privacy Policy URL: ${bestMatch}`);
        }
        console.log("---------------------------\n");

    } catch (error) {
        console.error("Error:", error.message);
    }
})();

// content.ts içindeki mantığın aynısı
