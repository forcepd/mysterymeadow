import { deepFreeze } from './deepFreeze';

/**
 * Illnesses, exam tools, and treatments (DESIGN 9.4, 9.5). Adding an illness needs only a data
 * entry here: pick one of the existing symptom animations (`symptomFx`) or add art for a new one.
 */

export interface ExamToolDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
}

export interface TreatmentDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
}

export interface ClueDef {
  readonly icon: string;
  readonly text: string;
}

/** How a sick animal looks in the world (render-only; the scene maps each kind to an animation). */
export type SymptomFx = 'sneeze' | 'wobble' | 'dots' | 'limp' | 'spots' | 'zzz';

export interface IllnessDef {
  readonly id: string;
  readonly name: string;
  /** Shown over the animal in the world and on its card, so the player can react right away. */
  readonly symptomIcon: string;
  /** Short visible symptoms for the Animal Card (not the diagnosis: that's the vet's job). */
  readonly symptoms: string;
  readonly symptomFx: SymptomFx;
  readonly treatmentId: string;
  /** What each exam tool reveals (tool id -> clues). Every tool must have at least one clue. */
  readonly clues: Readonly<Record<string, readonly ClueDef[]>>;
}

// prettier-ignore
export const EXAM_TOOLS: readonly ExamToolDef[] = deepFreeze([
  { id: 'stethoscope', name: 'Stethoscope',      icon: '🩺' },
  { id: 'thermometer', name: 'Thermometer',      icon: '🌡️' },
  { id: 'magnifier',   name: 'Magnifying Glass', icon: '🔍' },
]);

// prettier-ignore
export const TREATMENTS: readonly TreatmentDef[] = deepFreeze([
  { id: 'medicine_drops', name: 'Medicine Drops', icon: '💧' },
  { id: 'soothing_food',  name: 'Soothing Food',  icon: '🥣' },
  { id: 'flea_bath',      name: 'Flea Bath',      icon: '🛁' },
  { id: 'bandage',        name: 'Bandage',        icon: '🩹' },
  { id: 'cool_pack',      name: 'Cool Pack',      icon: '🧊' },
  { id: 'vitamin_treat',  name: 'Vitamin Treat',  icon: '🍬' },
]);

const SOUNDS_FINE: ClueDef = { icon: '✅', text: 'Heart and breathing sound fine' };
const NORMAL_TEMP: ClueDef = { icon: '✅', text: 'Normal temperature' };

export const ILLNESSES: readonly IllnessDef[] = deepFreeze([
  {
    id: 'sniffles',
    name: 'Sniffles',
    symptomIcon: '🤧',
    symptoms: 'Sneezing a lot',
    symptomFx: 'sneeze',
    treatmentId: 'medicine_drops',
    clues: {
      stethoscope: [{ icon: '🌬️', text: 'Stuffy, snuffly breathing' }],
      thermometer: [{ icon: '🌡️', text: 'Just a tiny bit warm' }],
      magnifier: [{ icon: '💧', text: 'A drippy nose' }],
    },
  },
  {
    id: 'tummy_trouble',
    name: 'Tummy Trouble',
    symptomIcon: '🤢',
    symptoms: 'Rumbly tummy',
    symptomFx: 'wobble',
    treatmentId: 'soothing_food',
    clues: {
      stethoscope: [{ icon: '🌀', text: 'A rumbly, grumbly belly' }],
      thermometer: [NORMAL_TEMP],
      magnifier: [{ icon: '🟢', text: 'Green cheeks' }],
    },
  },
  {
    id: 'itchy_fleas',
    name: 'Itchy Fleas',
    symptomIcon: '🐜',
    symptoms: 'Scratching and scratching',
    symptomFx: 'dots',
    treatmentId: 'flea_bath',
    clues: {
      stethoscope: [SOUNDS_FINE],
      thermometer: [NORMAL_TEMP],
      magnifier: [
        { icon: '⚫', text: 'Tiny bouncing dots in the fur!' },
        { icon: '🪶', text: 'Scratchy, messy fur' },
      ],
    },
  },
  {
    id: 'sore_paw',
    name: 'Sore Paw',
    symptomIcon: '🐾',
    symptoms: 'Limping',
    symptomFx: 'limp',
    treatmentId: 'bandage',
    clues: {
      stethoscope: [SOUNDS_FINE],
      thermometer: [NORMAL_TEMP],
      magnifier: [
        { icon: '🐾', text: 'One paw is puffy and sore' },
        { icon: '🚶', text: 'Doesn’t want to stand on it' },
      ],
    },
  },
  {
    id: 'spotty_fever',
    name: 'Spotty Fever',
    symptomIcon: '🌡️',
    symptoms: 'Red spots and feeling hot',
    symptomFx: 'spots',
    treatmentId: 'cool_pack',
    clues: {
      stethoscope: [{ icon: '💓', text: 'A fast, busy heartbeat' }],
      thermometer: [{ icon: '🔥', text: 'Very hot!' }],
      magnifier: [{ icon: '🔴', text: 'Little red spots' }],
    },
  },
  {
    id: 'sleepy_sickness',
    name: 'Sleepy Sickness',
    symptomIcon: '💤',
    symptoms: 'Yawning all day',
    symptomFx: 'zzz',
    treatmentId: 'vitamin_treat',
    clues: {
      stethoscope: [{ icon: '🐢', text: 'A slow, sleepy heartbeat' }],
      thermometer: [{ icon: '❄️', text: 'A little bit cool' }],
      magnifier: [{ icon: '😪', text: 'Droopy, tired eyes' }],
    },
  },
]);

export function getIllness(id: string): IllnessDef | undefined {
  return ILLNESSES.find((i) => i.id === id);
}

export function getTreatment(id: string): TreatmentDef | undefined {
  return TREATMENTS.find((t) => t.id === id);
}

export function getExamTool(id: string): ExamToolDef | undefined {
  return EXAM_TOOLS.find((t) => t.id === id);
}
