import {
  createWidgetClient,
  findUserByWidgetToken,
  getRequestToken,
  setWidgetHeaders,
  zonedIsoDate,
} from './_shared.js';

const TRAVEL_TIME_ZONE = 'Australia/Brisbane';

const clean = (value) => String(value || '').trim();

const mapLocation = (booking) => {
  const details = booking.details || {};
  if (booking.type === 'flight') {
    return [
      clean(details.destination_airport || details.destination || details.to),
      clean(details.destination_city || booking.city),
      clean(booking.country),
    ].filter(Boolean).join(', ');
  }
  return [
    clean(booking.title),
    clean(details.address),
    clean(booking.city),
    clean(booking.country),
  ].filter(Boolean).join(', ');
};

const mapUrl = (booking) => {
  const location = mapLocation(booking);
  return location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : '';
};

const timeLabel = (value) => {
  const text = clean(value);
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${match[2]}${suffix}`;
};

const typeMarker = (booking) => {
  if (booking.type === 'flight') return '✈';
  if (booking.type === 'hotel') return '⌂';
  return '•';
};

const dateLabel = (booking, today) => {
  const start = clean(booking.start_date);
  const end = clean(booking.end_date);
  if (start === today || end === today) return 'Today';
  if (booking.type === 'hotel' && start && end && start !== end) return `${start}→${end}`;
  return start || end;
};

const itemTitle = (booking) => {
  const details = booking.details || {};
  if (booking.type === 'flight') {
    const flight = clean(details.flight_number || details.flightNo);
    const route = [clean(details.origin || details.from || details.origin_code), clean(details.destination || details.to || details.dest_code)]
      .filter(Boolean)
      .join('→');
    return [flight, route].filter(Boolean).join(' ') || clean(booking.title) || 'Flight';
  }
  return clean(booking.title) || (booking.type === 'hotel' ? 'Hotel' : 'Travel item');
};

const itemMeta = (booking, today) => {
  const details = booking.details || {};
  if (booking.type === 'flight') {
    return [
      dateLabel(booking, today),
      timeLabel(details.departure_time || details.arrival_time),
      clean(booking.city),
      clean(booking.country),
    ].filter(Boolean).join(' · ');
  }
  if (booking.type === 'hotel') {
    const phase = booking.start_date === today ? 'check-in' : booking.end_date === today ? 'checkout' : 'stay';
    return [dateLabel(booking, today), phase, clean(booking.city), clean(booking.country)].filter(Boolean).join(' · ');
  }
  return [dateLabel(booking, today), clean(details.place_type), clean(booking.city), clean(booking.country)].filter(Boolean).join(' · ');
};

const isTodayOrFuture = (booking, date) => {
  const start = clean(booking.start_date);
  const end = clean(booking.end_date);
  if (!start && !end) return false;
  return (end || start) >= date;
};

const sortKey = (booking) => {
  const details = booking.details || {};
  const effectiveDate = clean(booking.start_date) || clean(booking.end_date) || '9999-99-99';
  const typePriority = booking.type === 'flight' ? '0' : booking.type === 'hotel' ? '1' : '2';
  return [
    effectiveDate,
    typePriority,
    clean(details.departure_time || details.start_time || details.time),
    String(booking.sort_order ?? 999999).padStart(6, '0'),
    clean(booking.title).toLowerCase(),
  ].join('|');
};

const toWidgetItem = (booking, today) => ({
  id: booking.id,
  marker: typeMarker(booking),
  title: itemTitle(booking),
  meta: itemMeta(booking, today),
  mapUrl: mapUrl(booking),
});

export default async function handler(req, res) {
  setWidgetHeaders(res, 'GET');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const supabase = createWidgetClient();
  if (!supabase) return res.status(500).json({ error: 'Widget API is not configured' });

  let matched;
  try {
    matched = await findUserByWidgetToken(supabase, token);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!matched) return res.status(403).json({ error: 'Invalid token' });

  const today = zonedIsoDate(new Date(), TRAVEL_TIME_ZONE);
  const { data: memberships, error: membershipError } = await supabase
    .from('travel_trip_members')
    .select('trip_id')
    .eq('user_id', matched.user_id);
  if (membershipError) return res.status(500).json({ error: membershipError.message });

  const tripIds = [...new Set((memberships || []).map((row) => row.trip_id).filter(Boolean))];
  if (tripIds.length === 0) {
    return res.status(200).json({ title: 'Travel', today, count: 0, items: [] });
  }

  const { data: bookings, error: bookingError } = await supabase
    .from('travel_bookings')
    .select('id,type,title,start_date,end_date,city,country,details,sort_order')
    .in('trip_id', tripIds)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true, nullsFirst: false });
  if (bookingError) return res.status(500).json({ error: bookingError.message });

  const items = (bookings || [])
    .filter((booking) => isTodayOrFuture(booking, today))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((booking) => toWidgetItem(booking, today));

  return res.status(200).json({
    title: 'Travel',
    today,
    count: items.length,
    items,
    updatedAt: new Date().toISOString(),
  });
}
