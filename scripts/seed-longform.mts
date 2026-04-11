/**
 * Patches the "On Packing Light" post with rich long-form PortableText body content.
 * Run with: npx tsx scripts/seed-longform.mts
 */

import { createClient } from '@sanity/client'
import { config } from 'dotenv'

config({ path: '.env.local' })

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

function block(key: string, style: string, text: string, marks: string[] = []) {
  return {
    _type: 'block',
    _key: key,
    style,
    markDefs: [],
    children: [{ _type: 'span', _key: `${key}s`, text, marks }],
  }
}

function listItem(key: string, text: string, listItem = 'bullet') {
  return {
    _type: 'block',
    _key: key,
    style: 'normal',
    listItem,
    level: 1,
    markDefs: [],
    children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
  }
}

const longBody = [
  block('h1a', 'h2', 'The Bag'),
  block('p1', 'normal', 'I travel with one bag. Not a personal item and a carry-on — one bag. It goes under the seat in front of me, it fits in an overhead if needed, and it has never, not once, been checked. This is a constraint I imposed on myself four years ago after losing a duffel somewhere between Heathrow and Narita, and it has quietly restructured the way I relate to objects.'),
  block('p2', 'normal', 'The bag is a 20L pack. It is not tactical, it is not techwear, it does not have a trolley sleeve or a laptop compartment with sixteen sub-pockets. It is a bag. It holds things. That is what I need it to do.'),

  block('h2a', 'h2', 'The List'),
  block('p3', 'normal', 'Everything that goes in the bag is on a list. Not a packing list — I\'ve tried those, they balloon into anxiety documents — but a fixed inventory. The same items, every time. The list does not grow. If something new goes in, something old comes out. The constraint is the discipline.'),
  block('p4', 'normal', 'Right now the inventory is:'),
  listItem('l1', '3 t-shirts (two white, one black)'),
  listItem('l2', '1 overshirt, heavyweight linen'),
  listItem('l3', '1 lightweight jacket, packable'),
  listItem('l4', '2 pairs of trousers (one casual, one that passes for smart)'),
  listItem('l5', '1 pair of shoes that can do both'),
  listItem('l6', '4 pairs of socks, 3 underwear'),
  listItem('l7', 'Wash bag: the minimal version'),
  listItem('l8', 'One book. Paperback.'),
  listItem('l9', 'Cables. Fewer than you think.'),
  block('p5', 'normal', 'That\'s it. No "just in case" items. If I need something I didn\'t bring, I buy it there and it either earns a permanent slot or gets left behind.'),

  block('h3a', 'h2', 'On Clothes That Travel'),
  block('p6', 'normal', 'Not all clothes travel well. Some things look perfect on a hanger in a well-lit bedroom and become disasters the moment they touch a overhead bin or a sweaty bus seat. I\'ve learned this the hard way: silk in humid cities, pale suede anywhere with rain, anything that requires ironing when you\'re staying somewhere that has neither an iron nor the time.'),
  block('p7', 'normal', 'The clothes that earn their place in the bag share certain properties. They don\'t wrinkle badly. They layer. They work across contexts — which usually means they\'re neither too formal nor too casual, sitting in a register that reads as intentional in either direction. They\'re the clothes that, when I land somewhere at midnight and need to be somewhere at 9am, don\'t require a decision.'),
  block('p8', 'normal', 'The MA-1 bomber I picked up in Seoul has been on every trip since I found it. It compresses into nothing, it goes over everything, it has never once looked wrong. That\'s the bar.'),

  block('h4a', 'h2', 'What Gets Left Behind'),
  block('p9', 'normal', 'The harder discipline is subtraction. Every item I\'ve removed from the inventory has had a reason I had to talk myself into. The second pair of shoes — "but what if there\'s a formal dinner." The extra trousers — "but what if one gets ruined." The backup jacket — "but what if the weather turns."'),
  block('p10', 'normal', 'None of those things have happened in a way that couldn\'t be handled by the items I kept. The formal dinner was fine in the one pair of shoes I had. The trousers were never ruined. The jacket I kept was enough for the weather that turned.'),
  block('p11', 'normal', '"What if" is the enemy of packing light. It is also, I\'ve noticed, the enemy of a lot of other things.'),

  block('h5a', 'h2', 'The Other Thing'),
  block('p12', 'normal', 'There\'s a version of this essay that\'s about minimalism, and I want to be careful not to write that essay. Minimalism as aesthetic has become its own kind of accumulation — a curated emptiness that is really just a different form of having things.'),
  block('p13', 'normal', 'This is not about having less. It\'s about having what works. The bag is full. Every item in it is there because I chose it deliberately and it has continued to justify that choice. Some of them are expensive. Some of them are old. All of them, in some sense, are mine in a way that things you accumulate without thinking rarely are.'),
  block('p14', 'normal', 'When I unpack after a trip, I know exactly what I had with me. I can account for each thing. That accounting — the small, private inventory of what you own and why — feels like something worth doing.'),

  block('h6a', 'h2', 'A Note on Buying Things Abroad'),
  block('p15', 'normal', 'I said earlier that if I need something I didn\'t bring, I buy it there. This has produced some of my favourite objects. The linen shirt from a Lisbon market that I wore for the rest of that trip and then brought home. A bar of soap from a pharmacy in Osaka that I\'ve since run out of and spent six months trying to source. A paperback I picked up in a second-hand shop in Amsterdam that I\'ve now read three times.'),
  block('p16', 'normal', 'These things have a different weight to them — not literally, though some of them are heavy — because they came from somewhere specific. They have a context. When I use them I remember where they\'re from, and that\'s a kind of record I find more interesting than photographs.'),
  block('p17', 'normal', 'The rule I\'ve settled on: if I buy something on a trip, I wear it or use it before I get home. If I can\'t justify using it before I land, I can\'t justify bringing it back. This keeps the inventory honest.'),

  block('close', 'normal', 'The bag waits by the door. It always has something in it — not much, but enough. That\'s the whole thing, really.'),
]

async function run() {
  // Find the post by slug
  const doc = await client.fetch(
    `*[_type == "content" && slug.current == "on-packing-light"][0]{ _id, title }`
  )

  if (!doc) {
    console.error('  ✗ Could not find "on-packing-light" — run the main seed first.')
    process.exit(1)
  }

  console.log(`\n  Patching "${doc.title}" (${doc._id}) with long-form body...\n`)

  await client.patch(doc._id).set({ body: longBody }).commit()

  console.log('  ✓ Done.\n')
}

run()
