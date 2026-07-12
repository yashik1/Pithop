export default function handler(_req: unknown, res: any) {
  res.status(200).json({ google: Boolean(process.env.GOOGLE_MAPS_API_KEY) });
}
