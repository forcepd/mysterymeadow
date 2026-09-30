import { Emitter } from '../sim/emitter';
import type { ExamResult } from '../sim/systems/vet';
import type { ToastMessage } from './toasts';

/**
 * App-level events between the Phaser world and the React overlay that aren't sim state
 * (selection, raw input, app toasts). Game state changes flow through GameSim events.
 */
export type AppEvents = {
  /** A tap landed on the world canvas (world coordinates). */
  canvasTap: { x: number; y: number };
  /** The player tapped an animal (or empty ground: null) in the world. */
  selectAnimal: { id: string | null };
  /** The world has drawn its first frame of sprites and accepts taps. */
  worldReady: undefined;
  /** A toast that doesn't come from a sim event. */
  toast: ToastMessage;
  /** Show the Vet Clinic for this animal (already checked in with `sim.goToVet`). */
  openVet: { animalId: string };
  /** Leave the Vet Clinic, back to the yard. */
  closeVet: undefined;
  /** An exam tool was used on the patient in the clinic scene. */
  vetExamined: { animalId: string; toolId: string; result: ExamResult };
  /**
   * Opens a full-screen overlay (null closes it). `incomingId`: an animal being kept while
   * every Pet Slot is full, so the Pets (Swap) screen asks where it goes.
   */
  openScreen: {
    screen:
      | 'pets'
      | 'dex'
      | 'store'
      | 'realEstate'
      | 'style'
      | 'settings'
      | 'training'
      | 'petWardrobe'
      | 'goals'
      | null;
    incomingId?: string;
    /** The animal a training or pet-wardrobe screen is for. */
    animalId?: string;
  };
  /** Which Phaser scene is showing. */
  sceneChanged: { scene: 'yard' | 'house' | 'vet' };
  /** Switch the world view between the yard and the house (DESIGN 17.2 toggle). */
  showZone: { zone: 'yard' | 'house' };
  /** Decorate mode on/off (DESIGN 12.3). */
  decorate: { on: boolean };
  /** Decorate: the item picked in the inventory tray, to place with a tap (null = none). */
  decorPick: { itemId: string | null };
  /**
   * Decorate: an item being dragged from the tray, at a point on the canvas in unzoomed world
   * units (0..1280 x 0..800; null = off the canvas). The scene converts it through its camera.
   * `drop` = the finger was lifted there.
   */
  decorDrag: { itemId: string; at: { x: number; y: number } | null; drop: boolean };
  /** Decorate: the placed item selected in the room (scene -> tray), or null. */
  decorSelect: { placedId: string | null };
  /** Decorate: something from the tray was placed (scene -> tray). */
  decorPlaced: { itemId: string; placedId: string };
};

export const appBus = new Emitter<AppEvents>();
