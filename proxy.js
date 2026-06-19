import { pipeline } from 'stream';
import { Readable } from 'stream';

export const proxyMedia = async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: 'missing url' });
  }

  try {
    const range = req.headers.range;

    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
    };

    if (range) {
      headers.Range = range;
    }

    const response = await fetch(url, { headers });

    res.setHeader('Access-Control-Allow-Origin', '*');

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) {
      res.setHeader('Accept-Ranges', acceptRanges);
    } else {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    res.status(response.status);

    if (!response.body) {
      return res.end();
    }

    const nodeStream = Readable.fromWeb(response.body);

    pipeline(nodeStream, res, (err) => {
      if (err) {
        console.error('stream error', err.message);
      }
    });

  } catch (error) {
    console.error('proxy error', error.message);
    res.status(500).json({ error: 'proxy failed' });
  }
};
