export type Category = 'prop' | 'ceiling' | 'floor' | 'character' | 'icon';

export interface PropSpec {
  id: string;
  category: 'prop' | 'ceiling';
  subject: string;
  quirk?: string;
  canvas: [number, number];
  width: number;
  base?: number;
  variants?: number;
  candidates?: number;
}

export interface FloorSpec {
  id: string;
  category: 'floor';
  subject: string;
  size: 32 | 64;
  tint?: boolean;
}

export interface CharacterSpec {
  id: string;
  category: 'character';
  subject: string;
  template?: 'mannequin' | 'dog';
  walk?: boolean;
  sneak?: boolean;
}

export interface IconSpec {
  id: string;
  category: 'icon';
  subject: string;
  size: 32 | 64;
}

export type AssetSpec = PropSpec | FloorSpec | CharacterSpec | IconSpec;

const prop = (id: string, subject: string, quirk: string, canvas: [number, number], width: number, extra: Partial<PropSpec> = {}): PropSpec => ({
  id: `fixture.${id}`,
  category: 'prop',
  subject,
  quirk,
  canvas,
  width,
  ...extra,
});

const build = (id: string, subject: string, quirk: string, canvas: [number, number], width: number, extra: Partial<PropSpec> = {}): PropSpec => ({
  id: `build.${id}`,
  category: 'ceiling',
  subject,
  quirk,
  canvas,
  width,
  ...extra,
});

const floor = (id: string, subject: string, size: 32 | 64 = 32, tint = false): FloorSpec => ({ id: `floor.${id}`, category: 'floor', subject, size, tint });

const char = (id: string, subject: string, extra: Partial<CharacterSpec> = {}): CharacterSpec => ({ id: `char.${id}`, category: 'character', subject, walk: true, ...extra });

const icon = (id: string, subject: string, size: 32 | 64 = 32): IconSpec => ({ id: `icon.${id}`, category: 'icon', subject, size });

export const ASSETS: AssetSpec[] = [
  prop('fountain', 'large square mall fountain with teal tiled basin and a tall cream concrete spout spraying water', 'pennies glinting in the water, a lost flip flop floating', [128, 112], 120),
  prop('palm', 'fake potted palm tree in a square tan planter box', 'one plastic frond drooping, cigarette butts in the planter gravel', [64, 96], 52, { base: 34 }),
  prop('bench', 'mall bench, dark wood slats on a black metal frame', 'pink gum stuck under the seat', [48, 40], 40),
  prop('kiosk.cellular', 'small mall cell phone accessory kiosk cart, hot pink canopy, glass case full of colorful flip phone faceplates', 'a rack of sparkly phone charms dangling', [64, 96], 56),
  prop('kiosk.shades', 'small mall sunglasses kiosk cart with mustard yellow canopy and a spinning rack of sunglasses', 'a tiny mirror on top', [64, 96], 56),
  prop('kiosk.charmz', 'small handmade mall kiosk cart with teal canopy, homemade phone charms and bootleg goods on display', 'cardboard sign taped on the side', [64, 96], 56),
  prop('table', 'food court table, round white laminate top with four teal molded plastic chairs', 'a half-eaten soft pretzel left on top', [64, 64], 50),
  prop('table.boundaries', 'bookstore cafe table, round dark wood with two chairs', 'a stack of paperbacks and a coffee cup', [64, 64], 48),
  prop('trash', 'mall trash can, brown square bin with a black domed lid', 'an orange smoothie cup balanced on top', [32, 48], 22),
  prop('cabinet', 'retro upright arcade cabinet, purple side art, glowing screen and joystick', 'a coin stuck in the slot', [48, 80], 38, { variants: 3, candidates: 6 }),
  prop('cabinet.ebgamez', 'video game store demo kiosk, black stand with a small crt tv and a wired controller', 'controller dangling on its cord', [48, 80], 38),
  prop('ddr', 'dance dance revolution arcade machine with a big glowing screen and a light-up dance pad platform with colored arrow panels', 'scuff marks on the pad', [80, 96], 66),
  prop('airhockey', 'air hockey table with light blue playfield and red puck', 'one paddle missing', [64, 48], 50),
  prop('prize', 'arcade prize counter, long glass display case full of plush toys, rubber duckies and kazoos', 'a giant stuffed banana on top', [96, 96], 86),
  prop('tokens', 'arcade token change machine, yellow and pink', 'out of order sticker peeling', [32, 64], 28),
  prop('rack', 'department store round clothing rack with mom jeans and pastel sweaters', 'a clearance tag dangling', [48, 48], 42),
  prop('rack.hotspot', 'goth mall store clothing rack with black band t-shirts and tripp pants with chains', 'one hot pink shirt among the black', [48, 48], 42),
  prop('rack.abercromp', 'preppy clothing store rack with polo shirts and distressed jeans', 'a perfume bottle left on the rail', [48, 48], 42),
  prop('shelf', 'department store shelf unit with folded towels and boxed small appliances', 'a lone price gun on the shelf', [48, 64], 42),
  prop('shelf.radiohut', 'electronics store shelf with batteries, coiled cables, walkie talkies and blister packs', 'a tangle of cords hanging off', [48, 64], 42),
  prop('shelf.ebgamez', 'video game store shelf with rows of game cases and strategy guides', 'a cardboard standee peeking out', [48, 64], 42),
  prop('shelf.spenceleys', 'novelty store shelf with lava lamps, blacklight posters and plasma ball', 'a rubber chicken', [48, 64], 42),
  prop('shelf.blockbusted', 'video rental store shelf with rows of vhs tapes and dvd cases, blue and yellow', 'be kind rewind sticker', [48, 64], 42),
  prop('shelf.bbw', 'bath and body store shelf with pastel lotion bottles and candles', 'one bottle tipped over', [48, 64], 42),
  prop('shelf.kbtoyz', 'toy store shelf with boxed action figures, yo-yos and colorful toys', 'a furby staring out', [48, 64], 42),
  prop('shelf.maint', 'grimy metal utility shelf with paint cans, bleach jugs and a toolbox', 'a roll of duct tape', [48, 64], 42),
  prop('bookshelf', 'tall dark wood bookstore bookshelf packed with colorful books', 'one book pulled halfway out', [48, 72], 42),
  prop('counter', 'small store checkout counter with a beige cash register', 'a bowl of free lollipops', [64, 56], 52),
  prop('counter.wide', 'long store checkout counter with a beige cash register and a credit card swiper', 'impulse buy candy rack on the end', [96, 96], 86),
  prop('counter.sbarrito', 'long pizza food court counter with glass sneeze guard and pizza slices under a red heat lamp', 'one slice missing', [96, 96], 86),
  prop('counter.teriyaki', 'long asian food court counter with steaming trays of orange chicken and rice', 'a plate of chicken samples on toothpicks', [96, 96], 86),
  prop('counter.jubilee', 'long orange smoothie food court counter with blenders and fruit', 'oranges stacked in a pyramid', [96, 96], 86),
  prop('counter.cinnabomb', 'long cinnamon roll food court counter with a glass case of giant iced cinnamon buns', 'a dripping icing bucket', [96, 96], 86),
  prop('cdbin', 'music store cd browsing bins on a low wooden stand', 'a cassette single sticking up', [48, 40], 40),
  prop('display.spenceleys', 'novelty store display table with glowing lava lamps and blacklight trinkets', 'a magic 8 ball', [64, 64], 48),
  prop('display.abercromp', 'preppy clothing store display table with stacks of folded polo shirts and flip flops', 'a mannequin hand', [64, 64], 48),
  prop('display.claire', 'accessories store display stand, pink spinning tower of earrings and hair clips', 'butterfly clips', [64, 64], 40),
  prop('display.bbw', 'bath and body store round display table with a pyramid of pastel lotion bottles', 'cucumber melon green bottles', [64, 64], 48),
  prop('display', 'store display table with stacked merchandise', 'a sale sign card', [64, 64], 48),
  prop('case', 'jewelry store glass display case with gold rings and necklaces on velvet', 'a tiny fingerprint smudge', [48, 48], 44),
  prop('cage', 'small wire pet store hamster cage on a plastic tray base with a colorful tube and a hamster wheel, seen from outside', 'a hamster running on the wheel', [48, 48], 38, {
    variants: 2,
    candidates: 6,
  }),
  prop('toybin', 'toy store bin overflowing with plush toys and bouncy balls', 'a furby on top', [64, 48], 50),
  prop('desk', 'office desk with a beige crt computer monitor and a keyboard', "a world's best boss mug", [48, 48], 46),
  prop('monitors', 'security office desk with a bank of four small crt monitors showing grainy camera feeds', 'a donut box', [48, 64], 46),
  prop('lostfound', 'blue lost and found bin overflowing', 'an umbrella, a single rollerblade and a tamagotchi', [48, 48], 44),
  prop('dumpster', 'dark green commercial dumpster with lid propped open', 'a pizza box sticking out', [80, 64], 70),
  prop('pallet', 'wooden shipping pallet stacked with cardboard boxes shrink wrapped', 'a return to vendor label', [64, 48], 56),
  prop('ladder', 'tall aluminum extension ladder standing upright', 'paint splatters on the rungs', [32, 80], 20, { base: 18 }),
  prop('vending', 'red soda vending machine with glowing front panel of soda buttons', 'a dent where someone kicked it', [48, 80], 38),
  prop('payphone', 'silver payphone on a short pole with a black handset', 'phone book chained underneath', [32, 64], 22),
  prop('car', 'early 2000s compact hatchback car, top view isometric', 'a dented bumper', [80, 64], 72, { variants: 3, candidates: 6 }),
  prop('lamppost', 'tall parking lot lamppost, dark gray pole with a flat box light', 'a faded lost dog flyer taped on', [32, 96], 24, { base: 10 }),
  prop('boxes', 'stack of three cardboard shipping boxes', 'this side up arrow upside down', [48, 48], 38),
  prop('oven', 'stainless steel commercial pizza oven with orange glow inside', 'a grease stain', [48, 48], 46),
  prop('panel', 'gray electrical breaker panel box mounted on a stand', 'handwritten labels and a yellow warning sticker', [32, 64], 30),
  prop('boiler', 'old water heater boiler with copper pipes and a pressure gauge', 'a rusty drip bucket', [64, 80], 48),
  prop('directory', 'mall directory sign, tall navy panel with a lit map', 'a red you-are-here dot', [32, 64], 26),
  prop('servicedesk', 'long customer service desk, blue front with white countertop', 'a call bell and a jar of pens', [96, 96], 84),
  prop('mopsink', 'janitor mop sink with a yellow mop bucket and wringer', 'a wet floor sign leaning', [48, 48], 38),
  prop('vacant', 'small lumpy pile of old store shelving hidden under a dusty white drop cloth sheet, no building', 'a crumpled for lease flyer on the floor beside it', [48, 40], 34),

  build('sleeping_bag', 'rolled out blue sleeping bag with a flat pillow', 'a comic book on the pillow', [48, 32], 44, { variants: 2, candidates: 6 }),
  build('crate', 'plastic milk crate stuffed with salvaged electronics parts', 'property of northgate dairy stencil', [40, 40], 34),
  build('cooler', 'red and white igloo cooler', 'held shut with duct tape', [40, 40], 32),
  build('splice', 'small gray junction box with spliced orange extension cords snaking out', 'wire nuts and electrical tape', [48, 32], 40),
  build('lamp', 'metal clip lamp on a short stand, shining warm light', 'clamped with a binder clip', [32, 48], 20),
  build('hot_plate', 'single burner hot plate with a dented pot of ramen', 'chopsticks sticking out', [32, 32], 28),
  build('futon', 'worn purple futon mattress on a low wood frame', 'a cigarette burn and a beanbag', [64, 40], 50),
  build('fridge', 'small white mini fridge', 'a dave matthews band sticker and a magnet', [32, 48], 28),
  build('foam', 'square sheet of yellow egg crate acoustic foam lying flat, bumpy egg crate texture, nothing on top of it', 'one torn corner patched with silver duct tape', [64, 40], 60),
  build('fan', 'white box fan standing upright', 'a ribbon tied to the grille', [32, 40], 26),
  build('tv', 'chunky crt tv on a milk crate with a black ps2 console beside it', 'tangled controller cords', [48, 48], 38),
  build('rope', 'removed ceiling tile leaving a dark square hole with the top of a rope ladder dropping down into it', 'a carabiner clipped to the edge', [64, 48], 52),
  build('lava_lamp', 'pink lava lamp glowing', 'a tiny smiley sticker on the base', [32, 48], 14),
  build('workbench', 'scrappy wooden workbench with a vise, soldering iron and gutted electronics', 'a radiohut bag', [48, 48], 46),
  build('pc', 'beige computer tower and chunky beige crt monitor on the floor', 'a 56k modem and a wifi antenna made from a pringles can', [48, 48], 44),
  build('raccoon', 'fake taxidermy raccoon decoy standing on hind legs', 'googly eyes', [40, 40], 28),
  build('periscope', 'homemade periscope made of cardboard paper towel tubes and silver duct tape, standing upright', 'a tiny mirror glinting at the top', [32, 64], 22),
  build('bean_bag', 'slouchy purple corduroy bean bag chair', 'a duct tape patch on one side', [40, 32], 30),
  build('card_table', 'small square folding card table with a deck of playing cards spread on top', 'one leg propped up on a stack of phone books', [40, 40], 30),
  build('dartboard', 'round cork dartboard on a wooden easel stand with three darts stuck in it', 'a crumpled photo of a man in a suit pinned to the bullseye', [32, 48], 22),
  build('disco_ball', 'mirrored disco ball hanging from a bent coat hanger on a pole stand', 'little light sparkles on the mirror tiles', [32, 56], 20),
  build('ball_pit', 'square inflatable kiddie pool overflowing with colorful plastic ball pit balls', 'a single sneaker poking out of the balls', [64, 48], 52),
  build('wet_floor', 'yellow plastic a-frame wet floor caution sign standing on the floor', 'a tiny slipping stick figure printed on it', [32, 48], 22),
  build('out_of_order', 'white paper grocery bag with OUT OF ORDER handwritten in black marker, taped shut', 'a strip of silver duct tape', [32, 40], 22),
  build('tamagotchi', 'tiny egg shaped pink tamagotchi toy with a small lcd screen lying on the floor', 'a keychain loop', [32, 32], 12),
  build('bunk', 'salvaged metal bunk bed with mismatched blankets', 'a band poster taped on', [64, 64], 50),
  build('xmas', 'colorful christmas string lights strung between two broom handles', 'a single tinsel strand', [64, 48], 54),
  build('heater', 'small orange space heater glowing', 'a sock drying on top', [32, 40], 22),
  build('scanner', 'black police scanner radio with antenna and red led', 'a handwritten list of codes', [32, 32], 22),
  build(
    'battery',
    'three black boxy lead acid car batteries in a row with red and black terminal posts, wired to a small gray power inverter box, no vehicles',
    'red and black jumper cable clamps',
    [48, 40],
    42,
  ),
  build('pod', 'soundproof sleeping pod tent built from gray moving blankets over a frame', 'a do not disturb sign', [64, 64], 58),
  build('hammock', 'striped hammock strung between two silver ducts', 'a pillow inside', [64, 48], 56),
  build('arcade', 'stolen upright arcade cabinet with neon pink marquee, scratched sides', 'duct tape on the joystick', [48, 80], 38),
  build('hot_tub', 'round wooden hot tub full of bubbling teal water with a little steam', 'a rubber duck floating and a pool noodle draped over the rim', [64, 48], 56),
  build('throne', 'massage chair turned into a throne with a paper burger king crown on top', 'christmas lights wrapped around', [48, 64], 46),
  build(
    'siphon',
    'small dented gray metal box with a coin hopper full of quarters and a clear plastic tube running down through a hole in the ceiling tile',
    'a canadian quarter jammed in the slot',
    [40, 40],
    30,
  ),
  build('asbestos', 'yellow and black striped hazard warning placard on a short metal stand, plain color blocks instead of words', 'zip tied to a broom handle', [32, 48], 22),
  build(
    'sleeping_bag.sleeper',
    'blue sleeping bag zipped up with a person asleep inside, only a messy mop of brown hair poking out onto a flat pillow',
    'a comic book lying open beside it',
    [48, 32],
    44,
  ),
  build(
    'futon.sleeper',
    'worn purple futon mattress on a low wood frame with a person asleep under a lumpy plaid blanket, messy hair on the pillow',
    'one socked foot sticking out the end',
    [64, 40],
    50,
  ),
  build('bunk.sleeper', 'salvaged metal bunk bed with mismatched blankets, a person asleep under the blanket on the bottom bunk, top bunk empty', 'a band poster taped on', [64, 64], 50),
  build('bunk.sleeper2', 'salvaged metal bunk bed with mismatched blankets, a person asleep under the blankets on both the top and bottom bunks', 'an arm dangling off the top bunk', [64, 64], 50),
  build('hammock.sleeper', 'striped hammock strung between two silver ducts, sagging with a person asleep inside wrapped in a blanket', 'one arm hanging over the edge', [64, 48], 56),
  build('floor_sleeper', 'person asleep curled up on bare plywood under a faded denim jacket, using a backpack as a pillow', 'a hole in one sock', [48, 32], 40),
  build('ac', 'large gray rooftop hvac air handler unit with a big round fan grille on top', 'a pigeon feather', [128, 96], 120),
  build(
    'hotdog',
    'six foot foam hot dog mascot costume hanging empty from a wire coat hanger on a broom handle stand, red sausage in a tan bun with a yellow mustard squiggle and an empty round face hole',
    'a tiny paper flag taped to the broom handle',
    [40, 64],
    28,
  ),

  floor('tile', 'light gray square ceramic floor tile with thin darker grout lines on the edges, subtle scuffs', 32, true),
  floor('terrazzo', 'cream terrazzo floor with small speckles of rust, teal and gray chips', 32),
  floor('carpet', 'light gray commercial low pile carpet with a subtle woven texture', 32, true),
  floor('office', 'light gray commercial carpet tile square with faint seam', 32, true),
  floor('black', 'dark glossy vinyl floor tile with faint glitter specks', 32, true),
  floor('wood', 'light oak wood floor planks running diagonally, visible grain and seams', 32, true),
  floor('concrete', 'light gray sealed concrete floor with faint cracks and stains', 32, true),
  floor('asphalt', 'dark asphalt parking lot texture with gum spots and fine cracks', 32),
  floor('arcade', 'dark navy arcade carpet with neon pink, cyan and yellow cosmic squiggles, triangles and planets', 64),
  floor('luxe', 'cream marble floor tile with soft gray veins', 32),
  floor('vacant', 'dusty bare concrete floor with old carpet glue marks and scattered debris', 32),
  floor('ceiling', 'top side of a dusty gray acoustic drop ceiling tile, fiberglass texture, thin metal grid on the edges', 32),
  floor('deck', 'raw plywood sheet, light wood grain, a few nail heads', 32),

  char('crew.drifter', 'scruffy evicted drifter man in a faded blue hoodie and gray beanie, stubble, overstuffed backpack'),
  char('crew.drifter.f', 'scruffy evicted drifter woman in a faded blue hoodie and gray beanie, messy brown ponytail, overstuffed backpack'),
  char('costume.hotdog', 'person wearing a six foot foam hot dog mascot costume, red sausage body inside a tan bun, yellow mustard squiggle down the front, face peeking out of a round face hole, black sneakers'),
  char('crew.mallrat', 'teen mall rat boy in a pastel pink polo, trucker hat, puka shell necklace, frosted tips'),
  char('crew.goth', 'goth teen girl in a black band tee and baggy black pants with chains, pale, dark lipstick, black hair'),
  char('crew.searz', 'middle aged laid off hardware clerk in a blue work vest with name tag, khakis, gray hair, reading glasses'),
  char('crew.skater', 'skater punk teen in a red baggy tee, backwards cap, huge baggy jeans, skateboard under one arm'),
  char('crew.techie', 'nerdy electronics repair guy in a red polo with pocket protector, big glasses, cargo pants'),
  char('crew.theater', 'theater kid with curly red hair, purple scarf and beret, dramatic pose'),
  char('crew.kiosk', 'slick kiosk salesman in a black button up shirt with gelled spiky hair, holding a lotion sample'),
  char('crew.grandma', 'elderly mall walker lady in a purple velour tracksuit, white visor, walkman headphones, white sneakers'),
  char('crew.runaway', 'teen runaway in a gray hoodie with the hood up, worn backpack, dirty sneakers'),
  char('crew.emo', 'emo kid with black side swept bangs covering one eye, tight black hoodie, studded belt, checkered shoes'),
  char('crew.santa', 'fired mall santa, big belly, red santa pants with suspenders over a white undershirt, long white beard'),
  char('crew.gary', 'former mall night guard, navy security uniform with the badge torn off, cap, mustache, holding a thermos'),

  char('npc.guard', 'chubby mall night security guard in navy uniform and cap, mustache, holding a flashlight'),
  char('npc.dayguard', 'mall cop standing on a segway, navy uniform, aviator sunglasses, mustache', { walk: false }),
  char('npc.janitor', 'mall janitor in gray green coveralls holding a mop, earbuds in'),
  char('npc.inspector', 'fire code inspector in an orange safety vest and yellow hard hat, holding a clipboard'),
  char('npc.dog', 'german shepherd police k9 dog wearing a black vest', { template: 'dog' }),
  char('npc.bandit', 'small cream and tan pet ferret with a dark brown mask, pink nose and a long low body', { template: 'dog' }),

  char('shopper.teen', 'teen girl in a pink velour tracksuit, flip phone in hand, shopping bag'),
  char('shopper.dad', 'suburban dad in cargo shorts, tucked in polo, white sneakers, fanny pack'),
  char('shopper.mom', 'soccer mom with a highlighted bob, capri pants, coffee cup and shopping bags'),
  char('shopper.prep', 'preppy teen boy in a popped collar polo, puka shells, flip flops'),
  char('shopper.biz', 'businessman in a rumpled gray suit with a bluetooth earpiece and briefcase'),
  char('shopper.kid', 'small kid holding a red balloon, light up sneakers'),
  char('shopper.senior', 'old man in a beige windbreaker and khakis holding a newspaper'),
  char('shopper.scene', 'scene girl with pink streaked black hair, band tee, striped arm warmers'),

  icon('cash', 'thick wad of green dollar bills folded with a rubber band'),
  icon('food', 'single slice of pepperoni pizza with melty cheese'),
  icon('parts', 'a hex nut, a bolt and a small green circuit board chip'),
  icon('goods', 'small taped cardboard box with a bright pink price sticker'),
  icon('alert', 'red rotating police siren light glowing'),
  icon('auction', 'wooden auction gavel'),
  icon('rank', 'small gold crown made of folded paper'),
  icon('structure', 'stack of plywood boards with a claw hammer'),
  icon('living', 'rolled blue sleeping bag with a pillow'),
  icon('power', 'orange extension cord plug with a yellow electric spark'),
  icon('stealth', 'cardboard box with two eyes peeking out of a slot'),
  icon('leisure', 'chunky crt television with a glowing screen'),
  icon('work', 'crossed wrench and screwdriver'),
  icon('business', 'beige cash register with the drawer open'),
  icon('sets', 'cozy armchair beside a small table lamp'),
  icon('mall', 'yellow wet floor caution sign'),
  icon('pager', 'black beeper pager with a green lcd screen'),
  icon('trophy', 'shiny gold trophy cup'),
  icon('art.intro', 'aluminum ladder poking up through a removed drop ceiling tile hole', 64),
  icon('art.news', 'folded newspaper with a big headline and a grainy photo', 64),
  icon('art.caught', 'red and blue police siren light flashing with motion lines', 64),
  icon('art.gary', 'mall security guard flashlight shining a beam, navy handle', 64),
  icon('art.feast', 'roast turkey on a paper plate with a party hat', 64),
  icon('art.wallet', 'pink velcro wallet stuffed with cash and a library card', 64),
  icon('art.mannequin', 'store window mannequin in cargo shorts with a red SALE sign hung around its neck', 64),
  icon('art.pretzel', 'giant golden soft pretzel on a runaway wheeled food cart with motion lines', 64),
  icon('art.ferret', 'mischievous ferret clutching a plastic spork in its mouth', 64),
  icon('art.psychic', 'glowing purple crystal ball on a fringed tablecloth with a tarot card', 64),
  icon('art.mallwalkers', 'pair of white walking sneakers with a teal sweatband and a pedometer', 64),
  icon('art.vent', 'louvered metal ceiling air vent grille with diagonal slats, a small cartoon speech bubble puffing out between the slats', 64),
  icon('art.hotdog', 'six foot foam hot dog mascot costume with a smiling face hole', 64),
  icon('art.furby', 'fuzzy round electronic toy pet with big eyes and pointy ears, teal and pink fur', 64),
  icon('art.glamour', 'soft focus glamour portrait in a gold frame with a pink feather boa draped over it', 64),
  icon('art.pager', 'black beeper pager buzzing with a green lcd screen', 64),
];

export const ASSET = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<string, AssetSpec>;
