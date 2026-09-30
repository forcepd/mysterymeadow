import Phaser from 'phaser';
import { appBus } from '../../bridge/appBus';
import type { GameSession } from '../../bridge/gameSession';
import { EXAM_TOOLS, getTreatment, type ExamToolDef } from '../../config/illnesses';
import { FONT, TEXT_RESOLUTION, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { Effects } from '../fx/effects';
import { VET_LAYOUT, vetToolPoint } from '../layout';
import { AnimalSprite } from '../sprites/AnimalSprite';

const WALL = 0xd9f1ea;
const WALL_STRIPE = 0xc4e8de;
const FLOOR = 0xf3e6cf;
const FLOOR_LINE = 0xe3d2b3;
const TABLE = 0xffffff;
const TABLE_EDGE = 0x9db7c9;
const TRAY = 0xfff8ea;
const TRAY_EDGE = 0xd6c29a;
/**
 * Tools draw above the patient, whose depth follows its y position (like every animal), and
 * below the effects (10 000). The tool being used or dragged goes on top of the others.
 */
const TOOL_DEPTH = 5_000;
const ACTIVE_TOOL_DEPTH = 5_001;

interface ToolButton {
  def: ExamToolDef;
  box: Phaser.GameObjects.Container;
  home: { x: number; y: number };
}

/**
 * Vet Clinic (DESIGN 9.5): the patient on the exam table and the exam tools. Tap a tool, or
 * drag it onto the patient, to examine; the clues go to the clinic panel (React) on the app
 * bus. Treatments are given from the panel's cabinet; this scene just animates the results.
 */
export class VetScene extends Phaser.Scene {
  private animalId = '';
  private patient: AnimalSprite | undefined;
  private fx!: Effects;
  private busy = false;
  private tools: ToolButton[] = [];
  private systemReducedMotion = false;

  constructor(private readonly session: GameSession) {
    super({ key: 'Vet', active: false });
  }

  init(data: { animalId: string }): void {
    this.animalId = data.animalId;
    this.busy = false;
    this.tools = [];
    this.patient = undefined;
  }

  create(): void {
    this.systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx = new Effects(this, this.reducedMotion);
    // A press has to move this far before it's a drag, so a plain tap still uses a tool.
    this.input.dragDistanceThreshold = 10;
    this.drawRoom();

    const animal = this.session.sim.getAnimal(this.animalId);
    if (animal) {
      const { x, y } = VET_LAYOUT.patient;
      this.patient = new AnimalSprite(this, animal, { x, y }, { x, y }, this.reducedMotion, false);
      this.patient.setScale(VET_LAYOUT.patientScale).disableInteractive();
      this.patient.sync(animal, this.session.sim.badges(animal.id), { x, y });
    }
    EXAM_TOOLS.forEach((def, i) => this.addTool(def, i));

    const { events } = this.session.sim;
    const offs = [
      events.on('vetTreated', ({ animal, treatmentId, cured, helped }) => {
        if (animal.id !== this.animalId) return;
        this.showTreatment(treatmentId, cured, helped);
      }),
      events.on('clinicReady', ({ animal }) => {
        if (animal.id === this.animalId && this.patient) {
          this.fx.floatText(this.patient.x, this.patient.y - 190, 'The vet is here!', '#3f7fbf');
        }
      }),
    ];
    const unsubscribe = () => offs.forEach((off) => off());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubscribe);
    appBus.emit('sceneChanged', { scene: 'vet' });
  }

  override update(): void {
    const animal = this.session.sim.getAnimal(this.animalId);
    if (!animal || !this.patient) return;
    const { x, y } = VET_LAYOUT.patient;
    this.patient.sync(animal, this.session.sim.badges(animal.id), { x, y });
    const waiting = this.session.sim.isWaitingAtClinic(this.animalId);
    const healthy = !animal.sickness;
    for (const t of this.tools) t.box.setAlpha(waiting || healthy ? 0.45 : 1);
  }

  private readonly reducedMotion = (): boolean =>
    this.systemReducedMotion || this.session.sim.state.world.settings.reducedMotion;

  private drawRoom(): void {
    const g = this.add.graphics();
    const floorY = 470;
    g.fillStyle(WALL, 1).fillRect(0, 0, WORLD_WIDTH, floorY);
    g.fillStyle(WALL_STRIPE, 1);
    for (let x = 0; x < WORLD_WIDTH; x += 80) g.fillRect(x, 0, 36, floorY);
    g.fillStyle(FLOOR, 1).fillRect(0, floorY, WORLD_WIDTH, WORLD_HEIGHT - floorY);
    g.lineStyle(3, FLOOR_LINE, 1);
    for (let y = floorY + 50; y < WORLD_HEIGHT; y += 60) g.lineBetween(0, y, WORLD_WIDTH, y);

    // A window and a big friendly cross sign.
    g.fillStyle(0xffffff, 1).fillRoundedRect(96, 110, 200, 150, 18);
    g.fillStyle(0xbfe3f5, 1).fillRoundedRect(108, 122, 176, 126, 12);
    g.lineStyle(6, 0xffffff, 1).lineBetween(196, 122, 196, 248).lineBetween(108, 185, 284, 185);
    g.fillStyle(0xffffff, 1).fillCircle(560, 180, 70);
    g.fillStyle(0xef6f6f, 1)
      .fillRoundedRect(540, 130, 40, 100, 8)
      .fillRoundedRect(510, 160, 100, 40, 8);

    // Exam table.
    const t = VET_LAYOUT.table;
    g.fillStyle(TABLE_EDGE, 1);
    g.fillRect(t.x + 40, t.y + t.height - 4, 22, 110).fillRect(
      t.x + t.width - 62,
      t.y + t.height - 4,
      22,
      110,
    );
    g.fillStyle(TABLE, 1).fillRoundedRect(t.x, t.y, t.width, t.height, 16);
    g.lineStyle(5, TABLE_EDGE, 1).strokeRoundedRect(t.x, t.y, t.width, t.height, 16);

    this.add
      .text(410, 36, 'Vet Clinic', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: '800',
        color: '#2f6f63',
        stroke: '#ffffff',
        strokeThickness: 8,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0);
  }

  private addTool(def: ExamToolDef, index: number): void {
    const home = vetToolPoint(index);
    const { width, height } = VET_LAYOUT.tools;
    const bg = this.add.graphics();
    bg.fillStyle(TRAY, 1).fillRoundedRect(-width / 2, -height / 2, width, height, 22);
    bg.lineStyle(5, TRAY_EDGE, 1).strokeRoundedRect(-width / 2, -height / 2, width, height, 22);
    const icon = this.add
      .text(0, -18, def.icon, { fontSize: '60px', resolution: TEXT_RESOLUTION })
      .setOrigin(0.5);
    const label = this.add
      .text(0, 42, def.name, {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: '800',
        color: '#4a3b33',
        resolution: TEXT_RESOLUTION,
        align: 'center',
        wordWrap: { width: width - 16 },
      })
      .setOrigin(0.5);
    const box = this.add.container(home.x, home.y, [bg, icon, label]).setSize(width, height);
    box.setInteractive({ useHandCursor: true, draggable: true });
    box.setDepth(TOOL_DEPTH);
    const tool: ToolButton = { def, box, home };
    this.tools.push(tool);

    let dragged = false;
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => (dragged = false));
    box.on(Phaser.Input.Events.GAMEOBJECT_DRAG_START, () => {
      dragged = true;
      box.setDepth(ACTIVE_TOOL_DEPTH).setScale(1.08);
    });
    box.on(Phaser.Input.Events.GAMEOBJECT_DRAG, (_p: unknown, x: number, y: number) =>
      box.setPosition(x, y),
    );
    box.on(Phaser.Input.Events.GAMEOBJECT_DRAG_END, () => {
      box.setScale(1);
      const { x, y } = VET_LAYOUT.patient;
      const near = Phaser.Math.Distance.Between(box.x, box.y, x, y - 60) < VET_LAYOUT.dropRadius;
      if (near) this.useTool(tool);
      else this.returnTool(tool);
    });
    // A tap (no drag) uses the tool too.
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!dragged) this.useTool(tool);
    });
  }

  private returnTool(tool: ToolButton, onDone?: () => void): void {
    this.tweens.add({
      targets: tool.box,
      x: tool.home.x,
      y: tool.home.y,
      angle: 0,
      duration: this.reducedMotion() ? 0 : 260,
      ease: 'Back.easeOut',
      onComplete: () => {
        tool.box.setDepth(TOOL_DEPTH);
        onDone?.();
      },
    });
  }

  /** The tool goes to the patient, does its thing, then reports what it found. */
  private useTool(tool: ToolButton): void {
    if (this.busy || !this.patient) {
      this.returnTool(tool);
      return;
    }
    const result = this.session.sim.vetExamine(this.animalId, tool.def.id);
    if (!result.ok) {
      appBus.emit('vetExamined', { animalId: this.animalId, toolId: tool.def.id, result });
      this.returnTool(tool);
      return;
    }
    this.busy = true;
    tool.box.setDepth(ACTIVE_TOOL_DEPTH);
    const { x, y } = VET_LAYOUT.patient;
    const at = { x: x + 70, y: y - 70 };
    const still = this.reducedMotion();
    this.tweens.chain({
      targets: tool.box,
      tweens: [
        { x: at.x, y: at.y, duration: still ? 0 : 280, ease: 'Sine.easeOut' },
        { angle: -14, duration: still ? 0 : 140, yoyo: true, repeat: still ? 0 : 2 },
      ],
      onComplete: () => {
        this.busy = false;
        this.returnTool(tool);
        if (this.patient) {
          result.clues.forEach((clue, i) =>
            this.fx.floatText(x - 60 + i * 120, y - 170, clue.icon, '#2f6f63', 44, i * 150),
          );
        }
        appBus.emit('vetExamined', { animalId: this.animalId, toolId: tool.def.id, result });
      },
    });
  }

  private showTreatment(treatmentId: string, cured: boolean, helped: boolean): void {
    const p = this.patient;
    if (!p) return;
    const icon = getTreatment(treatmentId)?.icon ?? '💊';
    this.fx.floatText(p.x, p.y - 140, icon, '#2f6f63', 54);
    if (helped && !cured) {
      this.fx.burst(p.x, p.y - 80, [0xffd84d, 0x9fe7ff, 0xffffff], 8);
      this.fx.floatText(p.x + 90, p.y - 200, '1 more!', '#3f7fbf', 36, 200);
      return;
    }
    if (cured) {
      this.fx.burst(p.x, p.y - 80, [0xffd84d, 0xff9fc4, 0x9fe7ff, 0xffffff], 14);
      this.fx.hearts(p.x, p.y - 150, 5);
      if (!this.reducedMotion()) {
        this.tweens.add({ targets: p, y: p.y - 40, duration: 220, yoyo: true, repeat: 1 });
      }
      return;
    }
    this.fx.floatText(p.x + 90, p.y - 200, '?', '#4a3b33', 60, 200);
    if (!this.reducedMotion()) {
      this.tweens.add({ targets: p, x: p.x + 10, duration: 70, yoyo: true, repeat: 3 });
    }
  }
}
