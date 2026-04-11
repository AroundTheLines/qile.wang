/**
 * Patches all wardrobe items with longer-form PortableText body content.
 * Run with: npx tsx scripts/seed-item-bodies.mts
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

function p(key: string, text: string) {
  return {
    _type: 'block', _key: key, style: 'normal', markDefs: [],
    children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
  }
}

function h(key: string, text: string) {
  return {
    _type: 'block', _key: key, style: 'h2', markDefs: [],
    children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
  }
}

const bodies: Record<string, object[]> = {
  'black-ma-1-bomber': [
    p('p1', 'Found at a vintage market in Seoul. Has been on more flights than most people.'),
    p('p2', 'I wasn\'t looking for a bomber. I was walking through Gwangjang Market in October, the kind of afternoon where the light goes orange early and every stall starts to blur into the next one, and there it was on a rail between a pair of 501s and something in corduroy that had seen better decades.'),
    p('p3', 'The seller, an older man with reading glasses pushed up on his forehead, didn\'t say much. Gave me a price, watched me try it on, gave me a slightly lower price when I handed it back. I bought it. It cost less than a round of drinks would have that evening.'),
    h('h1', 'Why It Works'),
    p('p4', 'MA-1s are a solved problem. The silhouette hasn\'t changed since the US Air Force locked it in during the 1950s — nylon shell, knit cuffs, the reversible orange lining for emergency visibility. Every iteration since has been a variation on the same template, and the template is right.'),
    p('p5', 'This one is a deadstock original, or close enough to it that I can\'t tell the difference. The nylon has that particular weight that modern versions never quite replicate — not heavy, but substantial. It compresses into roughly the size of a paperback. It works over a t-shirt in autumn and over a hoodie when it gets properly cold.'),
    p('p6', 'I\'ve worn it in Seoul, Tokyo, Copenhagen, and Montreal. It has never once been the wrong call.'),
    h('h2', 'The Orange Lining'),
    p('p7', 'I\'ve never worn it reversed. I don\'t think I will. But there\'s something about knowing the orange is there — this violent, emergency colour hidden inside something so muted — that I find interesting. The jacket has a secret. Most good things do.'),
    p('p8', 'The lining has a small stain near the left sleeve seam. I don\'t know what it\'s from. I have no plans to find out.'),
  ],

  'linen-shirt-off-white': [
    p('p1', 'A Lisbon market find. Wore it every hot day for two months straight.'),
    p('p2', 'There is a specific quality of light in Lisbon in June that makes everything look slightly overexposed, like you\'re living inside a photograph that\'s been left in the sun. I bought this shirt on a Saturday morning in the Feira da Ladra, the city\'s flea market, from a woman who was selling it alongside a collection of old ceramics and a stack of maps of places that no longer exist under those names.'),
    p('p3', 'She told me, in Portuguese I only half understood, that it had belonged to her husband. He had been a teacher. He had bought it in the eighties. I don\'t know how much of that was true and how much was sales technique, but I believed it, and I still do.'),
    h('h1', 'Linen in Heat'),
    p('p4', 'The argument for linen in summer is not complicated: it breathes, it wicks, it gets better looking as it wrinkles, and it signals a kind of relaxed intentionality that most hot-weather fabrics don\'t. A linen shirt says you thought about this. It also says you\'ve accepted that thinking about it only gets you so far.'),
    p('p5', 'This one is off-white — not cream, not ivory, not the yellow-white that cheap linen goes after a few washes. Off-white in the way that something naturally undyed ages. It pairs with everything I own in summer, which is not a coincidence; I bought it partly because I knew it would.'),
    h('h2', 'Two Months'),
    p('p6', 'I wore it in Lisbon for the rest of that trip. Then in Barcelona the following month, then on a long weekend in the Algarve. It got hand-washed in hotel sinks more times than I can count. It came out each time looking exactly the same, possibly better.'),
    p('p7', 'There is a small repair on the second button, done with thread that is almost but not quite the right colour. I did it myself in a guesthouse in Cascais with a sewing kit from the bathroom. It\'s visible if you know where to look. I find I don\'t mind.'),
  ],

  'silk-scarf-navy': [
    p('p1', 'Gift from a market stall owner in Marrakech who insisted it would bring good luck.'),
    p('p2', 'I had been in the medina for two hours and was completely lost, which is the correct way to be in the medina. The stall was at the end of an alley that I had gone down accidentally — looking for a way out to a square I could see on my map — and the owner, a man in his sixties with the air of someone who found tourists mildly entertaining, waved me over.'),
    p('p3', 'I told him I wasn\'t buying anything. He said he wasn\'t selling. He poured me tea from a height that seemed impossible without spilling, and when I eventually stood to leave, he pressed the scarf into my hands and said something I asked him to repeat twice and still didn\'t fully catch. The word for luck in Darija, he explained in French, sounds like the word for door. A good door, he said. For going through.'),
    h('h1', 'On Scarves'),
    p('p4', 'I have always been suspicious of accessories that announce themselves. A scarf worn as a statement is usually the wrong kind of statement. But a scarf that functions — that keeps wind off your neck on a cold morning, that folds into a jacket pocket, that can double as something to put between you and a surface you\'d rather not sit directly on — is a different object entirely.'),
    p('p5', 'This one is navy silk, finely woven, with a small geometric pattern at the edges that you only notice close up. It is the most useful thing I own that I did not buy.'),
    h('h2', 'Where It\'s Been'),
    p('p6', 'It came with me to Paris in March, which was cold enough that it was not decorative. To Tokyo in December, same. I wore it on a night train from Osaka to Kyoto and used it as a makeshift pillow for the last hour when I ran out of will to stay upright.'),
    p('p7', 'I don\'t know if it has brought good luck. I don\'t know that luck is trackable in that way. But I have had a run of decent trips since Marrakech, and I have not lost the scarf, which for me is the higher bar.'),
  ],

  'white-denim-wide-leg': [
    p('p1', 'Bought online from a Japanese label. Incredible in photos. Never travel with them.'),
    p('p2', 'Some things are for home. I know this now. I did not know it when I ordered the white denim from a small label in Osaka whose Instagram I had been following for a year — the kind of account that makes everything look like it was shot by someone who has thought very seriously about light.'),
    p('p3', 'They arrived in a cotton bag tied with a linen cord. The denim was substantial, the cut was exactly right, the hardware on the belt loops was the particular shade of brass that ages correctly. I wore them around my flat for a whole afternoon.'),
    h('h1', 'The Problem with White'),
    p('p4', 'White denim is an optimist\'s garment. It requires a certain faith in the day — that you will not brush against anything, sit anywhere interesting, eat anything with a sauce, or encounter the particular kind of casual disaster that is invisible until you look down.'),
    p('p5', 'In my flat, with nothing to brush against and nowhere to be, they look extraordinary. The wide leg falls correctly. The high waist sits where a high waist should. They photograph as though the light is specifically arranged to flatter them, which, in my flat, sometimes it is.'),
    h('h2', 'Never Travel With Them'),
    p('p6', 'I took them on one trip. Budapest, winter. By the second day there was a faint mark near the left knee from a cobblestone I\'d rather not discuss further. I spent twenty minutes in a hostel bathroom that evening attending to it. The mark is gone. The trousers are fine. I have not taken them travelling since.'),
    p('p7', 'This is not a failure. It is a correct allocation. Some things belong in specific contexts, and the discipline is knowing which things and which contexts, and not trying to make everything work everywhere. The white denim works here. That\'s enough.'),
    p('p8', 'I still follow the label\'s Instagram. I still find myself looking at each new drop. I have not bought anything else. This is what you might call growth.'),
  ],

  'chelsea-boots-black-leather': [
    p('p1', 'The boots that have outlasted three pairs of shoes bought the same year.'),
    p('p2', 'I bought them in London in September 2021 from a shop in Marylebone that I had walked past a dozen times before deciding it looked too expensive to go into. It was expensive. The boots cost more than I had budgeted for boots. I bought them anyway, on the logic — which I stand by — that the price per wear of a good boot bought once is lower than the price per wear of a mediocre boot bought three times.'),
    p('p3', 'Three pairs of shoes bought the same year are already gone. The boots are here.'),
    h('h1', 'What Makes a Chelsea'),
    p('p4', 'The Chelsea boot is Victorian in origin — designed, apparently, for Queen Victoria\'s equestrian use — and has the particular quality of very old designs that have survived: it is right. The elastic side panels, the pull tab at the heel, the clean line with no laces to come undone at bad moments. It works under trousers and visible above them. It works dressed up and not. It has no real failure mode.'),
    p('p5', 'These ones are black calf leather with a sole that can be resoled, which I have done once already. The cobbler charged what felt like a lot until I thought about what resoling costs versus replacing costs, at which point it felt like nothing.'),
    h('h2', 'On Caring for Things'),
    p('p6', 'I clean them after trips. Not obsessively — I\'m not someone who polishes shoes on a schedule — but after anything that matters: a long walk, a wet city, a day that asked a lot of them. I use a conditioner that smells like something from a previous century and leaves the leather looking like it has memory.'),
    p('p7', 'They were in Amsterdam in April when it rained continuously for four days. In Berlin in November for a week that involved more walking than I\'d planned. The leather has creased in the way good leather creases — with purpose, in lines that make sense.'),
    p('p8', 'Someone asked me once where I\'d got them and seemed surprised when I told them the price. "But they look older than that," they said. I took it as the compliment it probably wasn\'t meant to be.'),
  ],
}

async function run() {
  const docs = await client.fetch<{ _id: string; title: string; slug: { current: string } }[]>(
    `*[_type == "content" && content_type == "item"]{ _id, title, slug }`
  )

  console.log(`\n  Found ${docs.length} items.\n`)

  for (const doc of docs) {
    const body = bodies[doc.slug.current]
    if (!body) {
      console.log(`  – Skipping "${doc.title}" (no body defined for slug "${doc.slug.current}")`)
      continue
    }
    await client.patch(doc._id).set({ body }).commit()
    console.log(`  ✓ Patched: ${doc.title}`)
  }

  console.log('\n  Done.\n')
}

run()
