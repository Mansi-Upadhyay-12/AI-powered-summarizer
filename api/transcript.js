import { YoutubeTranscript } from 'youtube-transcript';

export default async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoId } = req.query;
  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId parameter' });
  }

  try {
    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
    return res.status(200).json(transcriptData);
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return res.status(500).json({
      error: error.message || 'Could not fetch transcript. The video might not have captions enabled or YouTube temporarily restricted access.'
    });
  }
}