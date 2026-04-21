/**
 * Consolidated fixture seed — wipes and repopulates every fixture type in one go:
 * content (items + post), locationDoc, trip, visit.
 *
 * Usage:
 *   npx tsx scripts/seed-phase5c.mts              (wipe + repopulate)
 *   npx tsx scripts/seed-phase5c.mts --dry-run    (log plan, write nothing)
 *
 * SAFETY: refuses to run unless NEXT_PUBLIC_SANITY_DATASET matches
 *         /^dev(elopment)?([-_].*)?$/ or --force-any-dataset is passed.
 */
import { createClient } from '@sanity/client'
import { config } from 'dotenv'
import { randomUUID } from 'crypto'

config({ path: '.env.local' })

const token = process.env.SANITY_API_TOKEN
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID

if (!token) {
  console.error(
    '\n  Missing SANITY_API_TOKEN in .env.local\n' +
      '  Get one at: https://sanity.io/manage → API → Tokens → Add token (Editor)\n',
  )
  process.exit(1)
}
if (!dataset || !projectId) {
  console.error('\n  Missing NEXT_PUBLIC_SANITY_DATASET or NEXT_PUBLIC_SANITY_PROJECT_ID in .env.local\n')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const forceAny = args.has('--force-any-dataset')

const DEV_DATASET_RE = /^dev(elopment)?([-_].*)?$/
if (!DEV_DATASET_RE.test(dataset) && !forceAny) {
  console.error(`Refusing to run on dataset '${dataset}'. Pass --force-any-dataset to override.`)
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

// ------------------------------
// Helpers
// ------------------------------

type SanityDoc = Record<string, unknown> & { _id: string; _type: string }

const doc = <T extends Record<string, unknown>>(_id: string, t: T & { _type: string }): SanityDoc =>
  ({ _id, ...t }) as SanityDoc
const slug = (s: string) => ({ _type: 'slug' as const, current: s })
const ref = (_ref: string) => ({ _type: 'reference' as const, _ref })
const key = () => randomUUID()

const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const contentId = (s: string) => `seed.content.${s}`
const locationId = (name: string) => `seed.location.${kebab(name)}`
const tripId = (tripSlug: string) => `seed.trip.${tripSlug}`
const visitId = (tripSlug: string, locName: string, startDate: string) =>
  `seed.visit.${tripSlug}.${kebab(locName)}.${startDate}`

function p(k: string, text: string) {
  return {
    _type: 'block',
    _key: k,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `${k}s`, text, marks: [] }],
  }
}
function h(k: string, text: string) {
  return {
    _type: 'block',
    _key: k,
    style: 'h2',
    markDefs: [],
    children: [{ _type: 'span', _key: `${k}s`, text, marks: [] }],
  }
}
function li(k: string, text: string, listItem = 'bullet') {
  return {
    _type: 'block',
    _key: k,
    style: 'normal',
    listItem,
    level: 1,
    markDefs: [],
    children: [{ _type: 'span', _key: `${k}s`, text, marks: [] }],
  }
}
function simpleBody(text: string) {
  return [
    {
      _type: 'block',
      _key: key(),
      style: 'normal',
      children: [{ _type: 'span', _key: key(), text, marks: [] }],
      markDefs: [],
    },
  ]
}

// ------------------------------
// Content: wardrobe items + post
// ------------------------------

const itemDefs = [
  {
    slug: 'black-ma-1-bomber',
    title: 'Black MA-1 Bomber',
    tags: ['outerwear', 'vintage', 'korea'],
    published_at: new Date('2023-10-15').toISOString(),
    body: [
      p('p1', 'Found at a vintage market in Seoul. Has been on more flights than most people.'),
      p('p2', "I wasn't looking for a bomber. I was walking through Gwangjang Market in October, the kind of afternoon where the light goes orange early and every stall starts to blur into the next one, and there it was on a rail between a pair of 501s and something in corduroy that had seen better decades."),
      p('p3', "The seller, an older man with reading glasses pushed up on his forehead, didn't say much. Gave me a price, watched me try it on, gave me a slightly lower price when I handed it back. I bought it. It cost less than a round of drinks would have that evening."),
      h('h1', 'Why It Works'),
      p('p4', "MA-1s are a solved problem. The silhouette hasn't changed since the US Air Force locked it in during the 1950s — nylon shell, knit cuffs, the reversible orange lining for emergency visibility. Every iteration since has been a variation on the same template, and the template is right."),
      p('p5', "This one is a deadstock original, or close enough to it that I can't tell the difference. The nylon has that particular weight that modern versions never quite replicate — not heavy, but substantial. It compresses into roughly the size of a paperback. It works over a t-shirt in autumn and over a hoodie when it gets properly cold."),
      p('p6', "I've worn it in Seoul, Tokyo, Copenhagen, and Montreal. It has never once been the wrong call."),
      h('h2', 'The Orange Lining'),
      p('p7', "I've never worn it reversed. I don't think I will. But there's something about knowing the orange is there — this violent, emergency colour hidden inside something so muted — that I find interesting. The jacket has a secret. Most good things do."),
      p('p8', "The lining has a small stain near the left sleeve seam. I don't know what it's from. I have no plans to find out."),
    ],
    locations: [
      { label: 'Seoul, South Korea', lat: 37.5665, lng: 126.978, sort_date: '2023-10-01', date_label: 'October 2023', note: 'Picked it up at Gwangjang Market.' },
      { label: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, sort_date: '2023-12-10', date_label: 'December 2023' },
    ],
  },
  {
    slug: 'linen-shirt-off-white',
    title: 'Linen Shirt — Off White',
    tags: ['tops', 'summer', 'portugal'],
    published_at: new Date('2023-07-20').toISOString(),
    body: [
      p('p1', 'A Lisbon market find. Wore it every hot day for two months straight.'),
      p('p2', "There is a specific quality of light in Lisbon in June that makes everything look slightly overexposed, like you're living inside a photograph that's been left in the sun. I bought this shirt on a Saturday morning in the Feira da Ladra, the city's flea market, from a woman who was selling it alongside a collection of old ceramics and a stack of maps of places that no longer exist under those names."),
      p('p3', "She told me, in Portuguese I only half understood, that it had belonged to her husband. He had been a teacher. He had bought it in the eighties. I don't know how much of that was true and how much was sales technique, but I believed it, and I still do."),
      h('h1', 'Linen in Heat'),
      p('p4', "The argument for linen in summer is not complicated: it breathes, it wicks, it gets better looking as it wrinkles, and it signals a kind of relaxed intentionality that most hot-weather fabrics don't. A linen shirt says you thought about this. It also says you've accepted that thinking about it only gets you so far."),
      p('p5', 'This one is off-white — not cream, not ivory, not the yellow-white that cheap linen goes after a few washes. Off-white in the way that something naturally undyed ages. It pairs with everything I own in summer, which is not a coincidence; I bought it partly because I knew it would.'),
      h('h2', 'Two Months'),
      p('p6', 'I wore it in Lisbon for the rest of that trip. Then in Barcelona the following month, then on a long weekend in the Algarve. It got hand-washed in hotel sinks more times than I can count. It came out each time looking exactly the same, possibly better.'),
      p('p7', "There is a small repair on the second button, done with thread that is almost but not quite the right colour. I did it myself in a guesthouse in Cascais with a sewing kit from the bathroom. It's visible if you know where to look. I find I don't mind."),
    ],
    locations: [
      { label: 'Lisbon, Portugal', lat: 38.7169, lng: -9.1399, sort_date: '2023-06-15', date_label: 'June 2023' },
      { label: 'Barcelona, Spain', lat: 41.3851, lng: 2.1734, sort_date: '2023-07-18', date_label: 'July 2023' },
    ],
  },
  {
    slug: 'silk-scarf-navy',
    title: 'Silk Scarf — Navy',
    tags: ['accessories', 'morocco', 'gifted'],
    published_at: new Date('2022-11-05').toISOString(),
    body: [
      p('p1', 'Gift from a market stall owner in Marrakech who insisted it would bring good luck.'),
      p('p2', "I had been in the medina for two hours and was completely lost, which is the correct way to be in the medina. The stall was at the end of an alley that I had gone down accidentally — looking for a way out to a square I could see on my map — and the owner, a man in his sixties with the air of someone who found tourists mildly entertaining, waved me over."),
      p('p3', "I told him I wasn't buying anything. He said he wasn't selling. He poured me tea from a height that seemed impossible without spilling, and when I eventually stood to leave, he pressed the scarf into my hands and said something I asked him to repeat twice and still didn't fully catch. The word for luck in Darija, he explained in French, sounds like the word for door. A good door, he said. For going through."),
      h('h1', 'On Scarves'),
      p('p4', "I have always been suspicious of accessories that announce themselves. A scarf worn as a statement is usually the wrong kind of statement. But a scarf that functions — that keeps wind off your neck on a cold morning, that folds into a jacket pocket, that can double as something to put between you and a surface you'd rather not sit directly on — is a different object entirely."),
      p('p5', 'This one is navy silk, finely woven, with a small geometric pattern at the edges that you only notice close up. It is the most useful thing I own that I did not buy.'),
      h('h2', "Where It's Been"),
      p('p6', 'It came with me to Paris in March, which was cold enough that it was not decorative. To Tokyo in December, same. I wore it on a night train from Osaka to Kyoto and used it as a makeshift pillow for the last hour when I ran out of will to stay upright.'),
      p('p7', "I don't know if it has brought good luck. I don't know that luck is trackable in that way. But I have had a run of decent trips since Marrakech, and I have not lost the scarf, which for me is the higher bar."),
    ],
    locations: [
      { label: 'Marrakech, Morocco', lat: 31.6295, lng: -7.9811, sort_date: '2022-11-01', date_label: 'November 2022' },
      { label: 'Paris, France', lat: 48.8566, lng: 2.3522, sort_date: '2023-03-20', date_label: 'March 2023' },
      { label: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, sort_date: '2023-12-08', date_label: 'December 2023' },
    ],
  },
  {
    slug: 'white-denim-wide-leg',
    title: 'White Denim — Wide Leg',
    tags: ['bottoms', 'japan', 'studio-only'],
    published_at: new Date('2024-01-10').toISOString(),
    body: [
      p('p1', 'Bought online from a Japanese label. Incredible in photos. Never travel with them.'),
      p('p2', 'Some things are for home. I know this now. I did not know it when I ordered the white denim from a small label in Osaka whose Instagram I had been following for a year — the kind of account that makes everything look like it was shot by someone who has thought very seriously about light.'),
      p('p3', 'They arrived in a cotton bag tied with a linen cord. The denim was substantial, the cut was exactly right, the hardware on the belt loops was the particular shade of brass that ages correctly. I wore them around my flat for a whole afternoon.'),
      h('h1', 'The Problem with White'),
      p('p4', "White denim is an optimist's garment. It requires a certain faith in the day — that you will not brush against anything, sit anywhere interesting, eat anything with a sauce, or encounter the particular kind of casual disaster that is invisible until you look down."),
      p('p5', 'In my flat, with nothing to brush against and nowhere to be, they look extraordinary. The wide leg falls correctly. The high waist sits where a high waist should. They photograph as though the light is specifically arranged to flatter them, which, in my flat, sometimes it is.'),
      h('h2', 'Never Travel With Them'),
      p('p6', "I took them on one trip. Budapest, winter. By the second day there was a faint mark near the left knee from a cobblestone I'd rather not discuss further. I spent twenty minutes in a hostel bathroom that evening attending to it. The mark is gone. The trousers are fine. I have not taken them travelling since."),
      p('p7', "This is not a failure. It is a correct allocation. Some things belong in specific contexts, and the discipline is knowing which things and which contexts, and not trying to make everything work everywhere. The white denim works here. That's enough."),
      p('p8', "I still follow the label's Instagram. I still find myself looking at each new drop. I have not bought anything else. This is what you might call growth."),
    ],
    locations: [
      { label: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, sort_date: '2024-01-01', date_label: 'January 2024' },
    ],
  },
  {
    slug: 'chelsea-boots-black-leather',
    title: 'Chelsea Boots — Black Leather',
    tags: ['footwear', 'leather', 'london'],
    published_at: new Date('2021-09-04').toISOString(),
    body: [
      p('p1', 'The boots that have outlasted three pairs of shoes bought the same year.'),
      p('p2', 'I bought them in London in September 2021 from a shop in Marylebone that I had walked past a dozen times before deciding it looked too expensive to go into. It was expensive. The boots cost more than I had budgeted for boots. I bought them anyway, on the logic — which I stand by — that the price per wear of a good boot bought once is lower than the price per wear of a mediocre boot bought three times.'),
      p('p3', 'Three pairs of shoes bought the same year are already gone. The boots are here.'),
      h('h1', 'What Makes a Chelsea'),
      p('p4', "The Chelsea boot is Victorian in origin — designed, apparently, for Queen Victoria's equestrian use — and has the particular quality of very old designs that have survived: it is right. The elastic side panels, the pull tab at the heel, the clean line with no laces to come undone at bad moments. It works under trousers and visible above them. It works dressed up and not. It has no real failure mode."),
      p('p5', 'These ones are black calf leather with a sole that can be resoled, which I have done once already. The cobbler charged what felt like a lot until I thought about what resoling costs versus replacing costs, at which point it felt like nothing.'),
      h('h2', 'On Caring for Things'),
      p('p6', "I clean them after trips. Not obsessively — I'm not someone who polishes shoes on a schedule — but after anything that matters: a long walk, a wet city, a day that asked a lot of them. I use a conditioner that smells like something from a previous century and leaves the leather looking like it has memory."),
      p('p7', "They were in Amsterdam in April when it rained continuously for four days. In Berlin in November for a week that involved more walking than I'd planned. The leather has creased in the way good leather creases — with purpose, in lines that make sense."),
      p('p8', 'Someone asked me once where I\'d got them and seemed surprised when I told them the price. "But they look older than that," they said. I took it as the compliment it probably wasn\'t meant to be.'),
    ],
    locations: [
      { label: 'London, UK', lat: 51.5074, lng: -0.1278, sort_date: '2021-09-01', date_label: 'September 2021', note: 'Portobello Road Market, Notting Hill.' },
      { label: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041, sort_date: '2022-04-12', date_label: 'April 2022' },
      { label: 'Berlin, Germany', lat: 52.52, lng: 13.405, sort_date: '2022-11-20', date_label: 'November 2022' },
    ],
  },
]

const postLongBody = [
  h('h1a', 'The Bag'),
  p('p1', 'I travel with one bag. Not a personal item and a carry-on — one bag. It goes under the seat in front of me, it fits in an overhead if needed, and it has never, not once, been checked. This is a constraint I imposed on myself four years ago after losing a duffel somewhere between Heathrow and Narita, and it has quietly restructured the way I relate to objects.'),
  p('p2', 'The bag is a 20L pack. It is not tactical, it is not techwear, it does not have a trolley sleeve or a laptop compartment with sixteen sub-pockets. It is a bag. It holds things. That is what I need it to do.'),
  h('h2a', 'The List'),
  p('p3', "Everything that goes in the bag is on a list. Not a packing list — I've tried those, they balloon into anxiety documents — but a fixed inventory. The same items, every time. The list does not grow. If something new goes in, something old comes out. The constraint is the discipline."),
  p('p4', 'Right now the inventory is:'),
  li('l1', '3 t-shirts (two white, one black)'),
  li('l2', '1 overshirt, heavyweight linen'),
  li('l3', '1 lightweight jacket, packable'),
  li('l4', '2 pairs of trousers (one casual, one that passes for smart)'),
  li('l5', '1 pair of shoes that can do both'),
  li('l6', '4 pairs of socks, 3 underwear'),
  li('l7', 'Wash bag: the minimal version'),
  li('l8', 'One book. Paperback.'),
  li('l9', 'Cables. Fewer than you think.'),
  p('p5', 'That\'s it. No "just in case" items. If I need something I didn\'t bring, I buy it there and it either earns a permanent slot or gets left behind.'),
  h('h3a', 'On Clothes That Travel'),
  p('p6', "Not all clothes travel well. Some things look perfect on a hanger in a well-lit bedroom and become disasters the moment they touch a overhead bin or a sweaty bus seat. I've learned this the hard way: silk in humid cities, pale suede anywhere with rain, anything that requires ironing when you're staying somewhere that has neither an iron nor the time."),
  p('p7', "The clothes that earn their place in the bag share certain properties. They don't wrinkle badly. They layer. They work across contexts — which usually means they're neither too formal nor too casual, sitting in a register that reads as intentional in either direction. They're the clothes that, when I land somewhere at midnight and need to be somewhere at 9am, don't require a decision."),
  p('p8', "The MA-1 bomber I picked up in Seoul has been on every trip since I found it. It compresses into nothing, it goes over everything, it has never once looked wrong. That's the bar."),
  h('h4a', 'What Gets Left Behind'),
  p('p9', "The harder discipline is subtraction. Every item I've removed from the inventory has had a reason I had to talk myself into. The second pair of shoes — \"but what if there's a formal dinner.\" The extra trousers — \"but what if one gets ruined.\" The backup jacket — \"but what if the weather turns.\""),
  p('p10', "None of those things have happened in a way that couldn't be handled by the items I kept. The formal dinner was fine in the one pair of shoes I had. The trousers were never ruined. The jacket I kept was enough for the weather that turned."),
  p('p11', "\"What if\" is the enemy of packing light. It is also, I've noticed, the enemy of a lot of other things."),
  h('h5a', 'The Other Thing'),
  p('p12', "There's a version of this essay that's about minimalism, and I want to be careful not to write that essay. Minimalism as aesthetic has become its own kind of accumulation — a curated emptiness that is really just a different form of having things."),
  p('p13', "This is not about having less. It's about having what works. The bag is full. Every item in it is there because I chose it deliberately and it has continued to justify that choice. Some of them are expensive. Some of them are old. All of them, in some sense, are mine in a way that things you accumulate without thinking rarely are."),
  p('p14', 'When I unpack after a trip, I know exactly what I had with me. I can account for each thing. That accounting — the small, private inventory of what you own and why — feels like something worth doing.'),
  h('h6a', 'A Note on Buying Things Abroad'),
  p('p15', "I said earlier that if I need something I didn't bring, I buy it there. This has produced some of my favourite objects. The linen shirt from a Lisbon market that I wore for the rest of that trip and then brought home. A bar of soap from a pharmacy in Osaka that I've since run out of and spent six months trying to source. A paperback I picked up in a second-hand shop in Amsterdam that I've now read three times."),
  p('p16', "These things have a different weight to them — not literally, though some of them are heavy — because they came from somewhere specific. They have a context. When I use them I remember where they're from, and that's a kind of record I find more interesting than photographs."),
  p('p17', "The rule I've settled on: if I buy something on a trip, I wear it or use it before I get home. If I can't justify using it before I land, I can't justify bringing it back. This keeps the inventory honest."),
  p('close', "The bag waits by the door. It always has something in it — not much, but enough. That's the whole thing, really."),
]

const postDefs = [
  {
    slug: 'on-packing-light',
    title: 'On Packing Light',
    tags: ['travel', 'philosophy'],
    published_at: new Date('2024-02-01').toISOString(),
    body: postLongBody,
  },
]

function buildItemDoc(def: (typeof itemDefs)[number]): SanityDoc {
  const locations = def.locations.map((l, i) => ({
    _type: 'location',
    _key: `loc${i + 1}`,
    label: l.label,
    coordinates: { lat: l.lat, lng: l.lng },
    sort_date: l.sort_date,
    date_label: l.date_label,
    ...(l.note ? { body: simpleBody(l.note) } : {}),
  }))
  return doc(contentId(def.slug), {
    _type: 'content',
    content_type: 'item',
    title: def.title,
    slug: slug(def.slug),
    body: def.body,
    tags: def.tags,
    published_at: def.published_at,
    locations,
    acquisition: { location_index: 0 },
  })
}

function buildPostDoc(def: (typeof postDefs)[number]): SanityDoc {
  return doc(contentId(def.slug), {
    _type: 'content',
    content_type: 'post',
    title: def.title,
    slug: slug(def.slug),
    body: def.body,
    tags: def.tags,
    published_at: def.published_at,
  })
}

// ------------------------------
// Phase 5C: locations / trips / visits
// ------------------------------

const locationDefs: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Marrakech, Morocco', lat: 31.63, lng: -7.99 },
  { name: 'Tokyo, Japan', lat: 35.68, lng: 139.65 },
  { name: 'Kyoto, Japan', lat: 35.01, lng: 135.77 },
  { name: 'Osaka, Japan', lat: 34.69, lng: 135.5 },
  { name: 'Berlin, Germany', lat: 52.52, lng: 13.4 },
  { name: 'Lisbon, Portugal', lat: 38.72, lng: -9.14 },
  { name: 'San Francisco, USA', lat: 37.77, lng: -122.42 },
  { name: 'Seattle, USA', lat: 47.61, lng: -122.33 },
  { name: 'Sydney, Australia', lat: -33.87, lng: 151.21 },
  { name: 'New York, USA', lat: 40.71, lng: -74.01 },
]

const locationDocs: SanityDoc[] = locationDefs.map(({ name, lat, lng }) =>
  doc(locationId(name), { _type: 'locationDoc', name, coordinates: { lat, lng } }),
)

const L = Object.fromEntries(locationDefs.map((l) => [l.name, locationId(l.name)])) as Record<string, string>

const tripDefs: Array<{ title: string; slug: string; body?: string }> = [
  { title: "Morocco '18", slug: 'morocco-2018', body: 'A week in Marrakech.' },
  { title: "Japan Spring '22", slug: 'japan-spring-2022', body: 'Three cities. Too much ramen.' },
  { title: "Berlin '22", slug: 'berlin-2022', body: 'First time. Kreuzberg.' },
  { title: "Berlin '24", slug: 'berlin-2024', body: 'Second time. Prenzlauer Berg.' },
  // No article body — tests grayed-out link.
  { title: 'Weekend in Lisbon', slug: 'weekend-in-lisbon' },
  { title: "SF Q4 '23", slug: 'sf-q4-2023', body: 'Work trip.' },
  { title: "Seattle Q4 '23", slug: 'seattle-q4-2023', body: 'Overlaps with SF.' },
  { title: 'NYC Day Trip', slug: 'nyc-day-trip', body: 'One day.' },
  { title: 'Round-the-World', slug: 'round-the-world', body: 'Everywhere.' },
  { title: 'Tokyo 2019', slug: 'tokyo-2019' },
]

const tripDocs: SanityDoc[] = tripDefs.map(({ title, slug: s, body }) =>
  doc(tripId(s), {
    _type: 'trip',
    title,
    slug: slug(s),
    ...(body ? { articleBody: simpleBody(body) } : {}),
  }),
)

const T = Object.fromEntries(tripDefs.map((t) => [t.title, tripId(t.slug)])) as Record<string, string>
const TRIP_SLUG = Object.fromEntries(tripDefs.map((t) => [t.title, t.slug])) as Record<string, string>

const bomberId = contentId('black-ma-1-bomber')
const scarfId = contentId('silk-scarf-navy')

function v(
  tripTitle: string,
  locName: string,
  startDate: string,
  endDate: string,
  items: string[] = [],
): SanityDoc {
  return doc(visitId(TRIP_SLUG[tripTitle], locName, startDate), {
    _type: 'visit',
    startDate,
    endDate,
    location: ref(L[locName]),
    trip: ref(T[tripTitle]),
    items: items.map((id) => ({ _type: 'reference' as const, _ref: id, _key: key() })),
  })
}

const visitDocs: SanityDoc[] = [
  v("Morocco '18", 'Marrakech, Morocco', '2018-05-10', '2018-05-17', [bomberId]),

  v("Japan Spring '22", 'Tokyo, Japan', '2022-03-05', '2022-03-10', [scarfId]),
  v("Japan Spring '22", 'Kyoto, Japan', '2022-03-10', '2022-03-14'),
  v("Japan Spring '22", 'Osaka, Japan', '2022-03-14', '2022-03-18', [bomberId]),

  v("Berlin '22", 'Berlin, Germany', '2022-09-01', '2022-09-07', [scarfId]),
  v("Berlin '24", 'Berlin, Germany', '2024-06-10', '2024-06-20'),

  v('Weekend in Lisbon', 'Lisbon, Portugal', '2023-02-17', '2023-02-19'),

  v("SF Q4 '23", 'San Francisco, USA', '2023-10-15', '2023-10-22'),
  v("Seattle Q4 '23", 'Seattle, USA', '2023-10-18', '2023-10-25'),

  v('NYC Day Trip', 'New York, USA', '2024-01-20', '2024-01-20'),

  v('Round-the-World', 'Tokyo, Japan', '2023-07-01', '2023-07-10'),
  v('Round-the-World', 'New York, USA', '2023-07-11', '2023-07-18'),
  v('Round-the-World', 'Sydney, Australia', '2023-07-19', '2023-07-25'),

  v('Tokyo 2019', 'Tokyo, Japan', '2019-04-01', '2019-04-10'),
]

// ------------------------------
// Run
// ------------------------------

async function create(d: SanityDoc) {
  if (dryRun) {
    const label = (d as { title?: string; name?: string }).title ?? (d as { name?: string }).name ?? ''
    console.log('  [would create]', d._type, d._id, label)
    return
  }
  await client.create(d)
}

async function wipe(types: string[]) {
  for (const type of types) {
    const ids = await client.fetch<string[]>(`*[_type == $type]._id`, { type })
    if (dryRun) {
      console.log(`  [would wipe] ${ids.length} ${type} docs`)
      continue
    }
    console.log(`  wiping ${ids.length} ${type} docs…`)
    for (const id of ids) await client.delete(id)
  }
}

async function main() {
  console.log(`Dataset: ${dataset}${dryRun ? ' (dry run)' : ''}`)

  // Order matters for deletion: visits reference trip/location/content,
  // so wipe leaf types before parents (though Sanity doesn't enforce FK cascades).
  await wipe(['visit', 'trip', 'locationDoc', 'content'])

  const itemDocs = itemDefs.map(buildItemDoc)
  const postDocs = postDefs.map(buildPostDoc)

  for (const d of itemDocs) await create(d)
  for (const d of postDocs) await create(d)
  for (const d of locationDocs) await create(d)
  for (const d of tripDocs) await create(d)
  for (const d of visitDocs) await create(d)

  const summary = await client.fetch(`{
    "items": count(*[_type == "content" && content_type == "item"]),
    "posts": count(*[_type == "content" && content_type == "post"]),
    "locations": count(*[_type == "locationDoc"]),
    "trips": count(*[_type == "trip"]),
    "visits": count(*[_type == "visit"]),
    "orphanItems": count(*[_type == "content" && content_type == "item" && count(*[_type == "visit" && references(^._id)]) == 0])
  }`)
  console.log('Summary:', summary)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
