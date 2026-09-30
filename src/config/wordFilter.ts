import { deepFreeze } from './deepFreeze';

/**
 * Local word filter for pet names and usernames (DESIGN 10.2, 20). Names never leave the
 * device, so this only has to keep a kid's own screen friendly. Edit freely.
 *
 * - `words`: blocked when they appear as a whole word (so "Cassie" and "Hello" are fine).
 * - `fragments`: blocked anywhere inside the name, even squished together ("xXfuckXx").
 *   Only put strings here that never occur inside ordinary names.
 */
// prettier-ignore
export const WORD_FILTER = deepFreeze({
  words: [
    'ass', 'arse', 'crap', 'damn', 'hell', 'piss', 'fuk',
    'dick', 'cock', 'prick', 'knob', 'balls', 'boob', 'boobs', 'tit', 'tits', 'nude',
    'sexy', 'sex', 'porn', 'hoe', 'ho', 'slut', 'whore', 'bitch', 'bastard', 'twat',
    'stupid', 'idiot', 'dumb', 'moron', 'loser', 'ugly', 'fat', 'hate', 'kill', 'die',
    'dead', 'gun', 'drug', 'drugs', 'weed', 'beer', 'vodka', 'nazi', 'hitler',
    'cum', 'rape', 'boner', 'horny',
  ],
  fragments: [
    'fuck', 'fck', 'shit', 'cunt', 'nigg', 'fagg', 'faggot', 'retard',
    'penis', 'vagina', 'pussy', 'dildo', 'wank', 'jizz',
    'asshole', 'dumbass', 'jackass', 'bullshit', 'motherf', 'kkk', 'suicide',
  ],
} as const);
