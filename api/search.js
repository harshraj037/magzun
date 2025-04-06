const https = require('https');
const { v4: uuidv4 } = require('uuid');

module.exports = async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Missing search query (?q=)' });
    }

    const rndKey = uuidv4();
    const sid = await getSearchId(query, rndKey);
    if (!sid) {
        return res.status(500).json({ error: 'Failed to get search ID' });
    }

    const result = await fetchSearchData(query, sid);
    return res.status(200).json(result);
};

async function getSearchId(query, rndKey) {
    const params = new URLSearchParams({
        qd: `[{"searchbox_query":"${query}","search_id":"${rndKey}","index":0,"type":"initial_searchbox","clicked_category":null,"staged_image":null,"location":null}]`,
        sid: rndKey,
        "x-sveltekit-invalidated": "01",
    }).toString();

    const options = {
        hostname: 'explorer.globe.engineer',
        path: `/search/__data.json?${params}`,
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
            "Referer": "https://explorer.globe.engineer/"
        }
    };

    return new Promise((resolve) => {
        https.get(options, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const sid = json.nodes[1].data[2];
                    resolve(sid);
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function fetchSearchData(query, sid) {
    const params = new URLSearchParams({
        queryData: `[{"searchbox_query":"${query}","search_id":"${sid}","index":0,"type":"initial_searchbox","clicked_category":null,"staged_image":null,"location":null}]`,
        userid_auth: "undefined",
        userid_local: "user_1731353625970_vp09l32rl",
        model: "default",
        search_id: sid
    }).toString();

    const options = {
        hostname: 'explorer-search.fly.dev',
        path: `/submitSearch?${params}`,
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/event-stream",
            "Referer": "https://explorer.globe.engineer/"
        }
    };

    return new Promise((resolve) => {
        https.get(options, (resp) => {
            let full = '';
            resp.on('data', (chunk) => { full += chunk.toString(); });
            resp.on('end', () => {
                const lines = full.split('\n').filter(l => l.startsWith('data: '));
                const result = { Summary: "", Details: [] };
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'top_answer_chunk') {
                            result.Summary += data.data + " ";
                        } else if (data.type === 'line' && data.data?.isLeaf) {
                            result.Details.push({ Detail: data.data.line });
                        } else if (data.type === 'image') {
                            const imageBlock = {
                                "Images related to": data.data.images?.[0]?.imageSearchQuery || "Not Found",
                                Images: data.data.images?.map(img => ({ "Image URL": img.imageUrl, Link: img.link })) || []
                            };
                            result.Details.push(imageBlock);
                        }
                    } catch (e) {}
                }
                result.Summary = result.Summary.trim();
                resolve(result);
            });
        }).on('error', () => resolve({ error: 'Failed to fetch' }));
    });
};
