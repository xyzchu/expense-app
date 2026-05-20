export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    title: 'SplitEase',
    value: '$1,171 left',
    subtitle: 'Widget test',
  });
}
