import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Missing query parameter ?q=' });
    }

    const rnd_key = uuidv4();

    const searchParams = new URLSearchParams({
        qd: `[{"searchbox_query":"${query}","search_id":"${rnd_key}","index":0,"type":"initial_searchbox"}]`,
        sid: rnd_key,
        'x-sveltekit-invalidated': '01',
    });

    const searchResp = await fetch(`https://explorer.globe.engineer/search/__data.json?${searchParams.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://explorer.globe.engineer/',
        }
    });

    const searchJson = await searchResp.json();
    const sid = searchJson?.nodes?.[1]?.data?.[2];
    if (!sid) return res.status(500).json({ error: 'Search ID not found' });

    const streamParams = new URLSearchParams({
        queryData: `[{"searchbox_query":"${query}","search_id":"${sid}","index":0,"type":"initial_searchbox"}]`,
        userid_auth: "undefined",
        userid_local: "user_1731353625970_vp09l32rl",
        model: "default",
        search_id: sid,
    });

    const streamResp = await fetch(`https://explorer-search.fly.dev/submitSearch?${streamParams.toString()}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://explorer.globe.engineer/',
        }
    });

    const bodyText = await streamResp.text();
    const lines = bodyText.trim().split('\n');

    let summary = '';
    let details = [];

    for (let line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data = JSON.parse(line.slice(6));

        if (data.type === 'top_answer_chunk') {
            summary += data.data + ' ';
        } else if (data.type === 'line' && data.data?.isLeaf) {
            details.push({ Detail: data.data.line });
        } else if (data.type === 'image') {
            const imgData = {
                "Images related to": data.data?.images?.[0]?.imageSearchQuery || "Not Found",
                Images: data.data?.images?.map(img => ({
                    "Image URL": img.imageUrl,
                    "Link": img.link
                })) || []
            };
            details.push(imgData);
        }
    }

    return res.json({
        Summary: summary.trim(),
        Details: details
    });
}
