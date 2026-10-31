// Compact list of major airports for code search (IATA / ICAO). Coordinates are aerodrome reference points.
export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
}

type Row = [string, string, string, string, number, number];

const ROWS: Row[] = [
  ["ATL", "KATL", "Hartsfield–Jackson Atlanta", "Atlanta", 33.6407, -84.4277],
  ["LAX", "KLAX", "Los Angeles Intl", "Los Angeles", 33.9416, -118.4085],
  ["ORD", "KORD", "O'Hare Intl", "Chicago", 41.9742, -87.9073],
  ["DFW", "KDFW", "Dallas/Fort Worth Intl", "Dallas", 32.8998, -97.0403],
  ["DEN", "KDEN", "Denver Intl", "Denver", 39.8561, -104.6737],
  ["JFK", "KJFK", "John F. Kennedy Intl", "New York", 40.6413, -73.7781],
  ["LGA", "KLGA", "LaGuardia", "New York", 40.7769, -73.874],
  ["EWR", "KEWR", "Newark Liberty Intl", "Newark", 40.6895, -74.1745],
  ["SFO", "KSFO", "San Francisco Intl", "San Francisco", 37.6213, -122.379],
  ["SEA", "KSEA", "Seattle–Tacoma Intl", "Seattle", 47.4502, -122.3088],
  ["LAS", "KLAS", "Harry Reid Intl", "Las Vegas", 36.084, -115.1537],
  ["MCO", "KMCO", "Orlando Intl", "Orlando", 28.4312, -81.3081],
  ["MIA", "KMIA", "Miami Intl", "Miami", 25.7959, -80.287],
  ["CLT", "KCLT", "Charlotte Douglas Intl", "Charlotte", 35.214, -80.9431],
  ["PHX", "KPHX", "Phoenix Sky Harbor", "Phoenix", 33.4342, -112.0116],
  ["IAH", "KIAH", "George Bush Intercontinental", "Houston", 29.9902, -95.3368],
  ["BOS", "KBOS", "Logan Intl", "Boston", 42.3656, -71.0096],
  ["MSP", "KMSP", "Minneapolis–St Paul Intl", "Minneapolis", 44.8848, -93.2223],
  ["DTW", "KDTW", "Detroit Metro Wayne County", "Detroit", 42.2162, -83.3554],
  ["PHL", "KPHL", "Philadelphia Intl", "Philadelphia", 39.8744, -75.2424],
  ["IAD", "KIAD", "Washington Dulles Intl", "Washington", 38.9531, -77.4565],
  ["DCA", "KDCA", "Reagan National", "Washington", 38.8512, -77.0402],
  ["BWI", "KBWI", "Baltimore/Washington Intl", "Baltimore", 39.1774, -76.6684],
  ["SLC", "KSLC", "Salt Lake City Intl", "Salt Lake City", 40.7899, -111.9791],
  ["SAN", "KSAN", "San Diego Intl", "San Diego", 32.7338, -117.1933],
  ["TPA", "KTPA", "Tampa Intl", "Tampa", 27.9755, -82.5332],
  ["FLL", "KFLL", "Fort Lauderdale–Hollywood", "Fort Lauderdale", 26.0742, -80.1506],
  ["PDX", "KPDX", "Portland Intl", "Portland", 45.5898, -122.5951],
  ["AUS", "KAUS", "Austin–Bergstrom Intl", "Austin", 30.1975, -97.6664],
  ["BNA", "KBNA", "Nashville Intl", "Nashville", 36.1263, -86.6774],
  ["MDW", "KMDW", "Chicago Midway", "Chicago", 41.7868, -87.7522],
  ["HNL", "PHNL", "Daniel K. Inouye Intl", "Honolulu", 21.3245, -157.9251],
  ["ANC", "PANC", "Ted Stevens Anchorage Intl", "Anchorage", 61.1743, -149.9962],
  ["SJC", "KSJC", "San José Mineta Intl", "San Jose", 37.3639, -121.9289],
  ["OAK", "KOAK", "Oakland Intl", "Oakland", 37.7126, -122.2197],
  ["MSY", "KMSY", "Louis Armstrong New Orleans", "New Orleans", 29.9934, -90.258],
  ["RDU", "KRDU", "Raleigh–Durham Intl", "Raleigh", 35.8801, -78.788],
  ["STL", "KSTL", "St. Louis Lambert Intl", "St. Louis", 38.7487, -90.37],
  ["YYZ", "CYYZ", "Toronto Pearson Intl", "Toronto", 43.6777, -79.6248],
  ["YVR", "CYVR", "Vancouver Intl", "Vancouver", 49.1967, -123.1815],
  ["YUL", "CYUL", "Montréal–Trudeau Intl", "Montréal", 45.4706, -73.7408],
  ["YYC", "CYYC", "Calgary Intl", "Calgary", 51.1215, -114.0076],
  ["MEX", "MMMX", "Mexico City Intl", "Mexico City", 19.4361, -99.0719],
  ["CUN", "MMUN", "Cancún Intl", "Cancún", 21.0365, -86.877],
  ["LHR", "EGLL", "Heathrow", "London", 51.47, -0.4543],
  ["LGW", "EGKK", "Gatwick", "London", 51.1537, -0.1821],
  ["STN", "EGSS", "Stansted", "London", 51.885, 0.235],
  ["MAN", "EGCC", "Manchester", "Manchester", 53.365, -2.2728],
  ["DUB", "EIDW", "Dublin", "Dublin", 53.4264, -6.2499],
  ["CDG", "LFPG", "Charles de Gaulle", "Paris", 49.0097, 2.5479],
  ["ORY", "LFPO", "Orly", "Paris", 48.7262, 2.3652],
  ["AMS", "EHAM", "Schiphol", "Amsterdam", 52.3105, 4.7683],
  ["FRA", "EDDF", "Frankfurt", "Frankfurt", 50.0379, 8.5622],
  ["MUC", "EDDM", "Munich", "Munich", 48.3537, 11.775],
  ["BER", "EDDB", "Berlin Brandenburg", "Berlin", 52.3667, 13.5033],
  ["ZRH", "LSZH", "Zurich", "Zurich", 47.4582, 8.5555],
  ["GVA", "LSGG", "Geneva", "Geneva", 46.2381, 6.1089],
  ["VIE", "LOWW", "Vienna Intl", "Vienna", 48.1103, 16.5697],
  ["MAD", "LEMD", "Adolfo Suárez Madrid–Barajas", "Madrid", 40.4983, -3.5676],
  ["BCN", "LEBL", "Barcelona–El Prat", "Barcelona", 41.2974, 2.0833],
  ["LIS", "LPPT", "Humberto Delgado", "Lisbon", 38.7742, -9.1342],
  ["FCO", "LIRF", "Leonardo da Vinci–Fiumicino", "Rome", 41.8003, 12.2389],
  ["MXP", "LIMC", "Milan Malpensa", "Milan", 45.63, 8.7231],
  ["CPH", "EKCH", "Copenhagen", "Copenhagen", 55.618, 12.656],
  ["ARN", "ESSA", "Stockholm Arlanda", "Stockholm", 59.6498, 17.9238],
  ["OSL", "ENGM", "Oslo Gardermoen", "Oslo", 60.1976, 11.1004],
  ["HEL", "EFHK", "Helsinki-Vantaa", "Helsinki", 60.3172, 24.9633],
  ["BRU", "EBBR", "Brussels", "Brussels", 50.901, 4.4844],
  ["WAW", "EPWA", "Warsaw Chopin", "Warsaw", 52.1657, 20.9671],
  ["PRG", "LKPR", "Václav Havel", "Prague", 50.1008, 14.26],
  ["ATH", "LGAV", "Athens Intl", "Athens", 37.9364, 23.9445],
  ["IST", "LTFM", "Istanbul", "Istanbul", 41.2753, 28.7519],
  ["SAW", "LTFJ", "Sabiha Gökçen", "Istanbul", 40.8986, 29.3092],
  ["KEF", "BIKF", "Keflavík Intl", "Reykjavík", 63.985, -22.6056],
  ["DXB", "OMDB", "Dubai Intl", "Dubai", 25.2532, 55.3657],
  ["AUH", "OMAA", "Zayed Intl", "Abu Dhabi", 24.433, 54.6511],
  ["DOH", "OTHH", "Hamad Intl", "Doha", 25.2731, 51.6081],
  ["RUH", "OERK", "King Khalid Intl", "Riyadh", 24.9576, 46.6988],
  ["TLV", "LLBG", "Ben Gurion", "Tel Aviv", 32.0055, 34.8854],
  ["CAI", "HECA", "Cairo Intl", "Cairo", 30.1219, 31.4056],
  ["ADD", "HAAB", "Bole Intl", "Addis Ababa", 8.9779, 38.7993],
  ["NBO", "HKJK", "Jomo Kenyatta Intl", "Nairobi", -1.3192, 36.9278],
  ["JNB", "FAOR", "O. R. Tambo Intl", "Johannesburg", -26.1367, 28.2411],
  ["CPT", "FACT", "Cape Town Intl", "Cape Town", -33.9715, 18.6021],
  ["DEL", "VIDP", "Indira Gandhi Intl", "Delhi", 28.5562, 77.1],
  ["BOM", "VABB", "Chhatrapati Shivaji Maharaj Intl", "Mumbai", 19.0896, 72.8656],
  ["BLR", "VOBL", "Kempegowda Intl", "Bengaluru", 13.1986, 77.7066],
  ["SIN", "WSSS", "Changi", "Singapore", 1.3644, 103.9915],
  ["KUL", "WMKK", "Kuala Lumpur Intl", "Kuala Lumpur", 2.7456, 101.7099],
  ["BKK", "VTBS", "Suvarnabhumi", "Bangkok", 13.69, 100.7501],
  ["CGK", "WIII", "Soekarno–Hatta Intl", "Jakarta", -6.1256, 106.6559],
  ["MNL", "RPLL", "Ninoy Aquino Intl", "Manila", 14.5086, 121.0198],
  ["HKG", "VHHH", "Hong Kong Intl", "Hong Kong", 22.308, 113.9185],
  ["TPE", "RCTP", "Taoyuan Intl", "Taipei", 25.0797, 121.2342],
  ["PEK", "ZBAA", "Beijing Capital Intl", "Beijing", 40.0799, 116.6031],
  ["PKX", "ZBAD", "Beijing Daxing Intl", "Beijing", 39.5098, 116.4105],
  ["PVG", "ZSPD", "Shanghai Pudong Intl", "Shanghai", 31.1443, 121.8083],
  ["CAN", "ZGGG", "Guangzhou Baiyun Intl", "Guangzhou", 23.3924, 113.2988],
  ["ICN", "RKSI", "Incheon Intl", "Seoul", 37.4602, 126.4407],
  ["HND", "RJTT", "Haneda", "Tokyo", 35.5494, 139.7798],
  ["NRT", "RJAA", "Narita Intl", "Tokyo", 35.772, 140.3929],
  ["KIX", "RJBB", "Kansai Intl", "Osaka", 34.4347, 135.244],
  ["SYD", "YSSY", "Sydney Kingsford Smith", "Sydney", -33.9399, 151.1753],
  ["MEL", "YMML", "Melbourne", "Melbourne", -37.669, 144.841],
  ["BNE", "YBBN", "Brisbane", "Brisbane", -27.3842, 153.1175],
  ["PER", "YPPH", "Perth", "Perth", -31.9385, 115.9672],
  ["AKL", "NZAA", "Auckland", "Auckland", -37.0082, 174.785],
  ["GRU", "SBGR", "São Paulo–Guarulhos Intl", "São Paulo", -23.4356, -46.4731],
  ["GIG", "SBGL", "Rio de Janeiro–Galeão Intl", "Rio de Janeiro", -22.809, -43.2506],
  ["EZE", "SAEZ", "Ministro Pistarini Intl", "Buenos Aires", -34.8222, -58.5358],
  ["SCL", "SCEL", "Arturo Merino Benítez Intl", "Santiago", -33.393, -70.7858],
  ["BOG", "SKBO", "El Dorado Intl", "Bogotá", 4.7016, -74.1469],
  ["LIM", "SPJC", "Jorge Chávez Intl", "Lima", -12.0219, -77.1143],
  ["PTY", "MPTO", "Tocumen Intl", "Panama City", 9.0714, -79.3835],
];

export const AIRPORTS: Airport[] = ROWS.map(([iata, icao, name, city, lat, lon]) => ({
  iata,
  icao,
  name,
  city,
  lat,
  lon,
}));

export function findAirport(code: string): Airport | null {
  const c = code.trim().toUpperCase();
  if (c.length === 3) return AIRPORTS.find((a) => a.iata === c) ?? null;
  if (c.length === 4) return AIRPORTS.find((a) => a.icao === c) ?? null;
  return null;
}

export function searchAirports(q: string, limit = 5): Airport[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  return AIRPORTS.filter(
    (a) =>
      a.iata.toLowerCase().startsWith(s) ||
      a.icao.toLowerCase().startsWith(s) ||
      a.city.toLowerCase().startsWith(s) ||
      a.name.toLowerCase().includes(s),
  ).slice(0, limit);
}
