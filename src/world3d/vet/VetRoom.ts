import {
  CanvasTexture,
  Group,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { appBus } from '../../bridge/appBus';
import type { GameSession } from '../../bridge/gameSession';
import { EXAM_TOOLS, getTreatment, type ExamToolDef } from '../../config/illnesses';
import { VET_LAYOUT, vetToolPoint } from '../../game/layout';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../game/constants';
import { AnimalActor, type FrameContext } from '../animals/AnimalActor';
import { part, sceneryMesh, toonGradient } from '../art/toon';
import { CameraRig } from '../CameraRig';
import { toUnits, type Point3 } from '../coords';
import type { Effects3D } from '../fx/Effects3D';
import styles from './vet.module.css';

/** The room, in its own space: the original's clinic laid out across the screen, left to right. */
const BACK = -1.6;
const FRONT = 2.2;
const WALL_H = 3.2;
const TABLE_TOP = 0.78;
/** Where the patient stands: the original's patient spot, on the table. */
const PATIENT = { x: toUnits(VET_LAYOUT.patient.x - WORLD_WIDTH / 2), z: 0.05 };
const HOME_POLAR = (58 * Math.PI) / 180;

interface Tool {
  def: ExamToolDef;
  el: HTMLButtonElement;
}

/** Stripes on the wall and boards on the floor, like the original's clinic. */
function stripes(color: string, stripe: string, vertical: boolean, repeat: [number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = stripe;
  if (vertical) ctx.fillRect(0, 0, 29, 64);
  else ctx.fillRect(0, 0, 64, 4);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(...repeat);
  return t;
}

/**
 * The Vet Clinic in 3D (DESIGN 9.5), like the original's VetScene: the patient on the exam table
 * and three exam tools. Tap a tool, or drag it onto the patient, to examine; the clues go to the
 * clinic panel (React) on the app bus, and treatments from the panel play out here.
 */
export class VetRoom {
  readonly group = new Group();
  readonly rig: CameraRig;
  private patient: AnimalActor | null = null;
  private animalId = '';
  private busy = false;
  private readonly tools: Tool[] = [];
  private readonly toolLayer = document.createElement('div');
  private readonly offs: (() => void)[] = [];
  private scale = 1;

  constructor(
    private readonly session: GameSession,
    private readonly host: HTMLElement,
    private readonly fx: Effects3D,
    /** Where a room point is on the canvas (CSS px), for the tools. */
    private readonly toCanvas: (p: Point3) => { x: number; y: number } | null,
    private readonly reducedMotion: () => boolean,
  ) {
    this.group.name = 'vet';
    this.group.visible = false;
    this.build();
    this.rig = new CameraRig(
      [
        { x: -6.4, y: 0, z: BACK },
        { x: 6.4, y: 0, z: BACK },
        { x: -6.4, y: 0, z: FRONT },
        { x: 6.4, y: 0, z: FRONT },
        { x: -6.4, y: WALL_H * 0.9, z: BACK },
        { x: 6.4, y: WALL_H * 0.9, z: BACK },
      ],
      16 / 10,
      HOME_POLAR,
    );

    this.toolLayer.className = styles.tools!;
    this.toolLayer.hidden = true;
    EXAM_TOOLS.forEach((def) => this.addTool(def));
    host.appendChild(this.toolLayer);

    const { events } = session.sim;
    this.offs.push(
      events.on('vetTreated', ({ animal, treatmentId, cured, helped }) => {
        if (animal.id === this.animalId) this.showTreatment(treatmentId, cured, helped);
      }),
      events.on('clinicReady', ({ animal }) => {
        if (animal.id === this.animalId) this.say('The vet is here!', '#3f7fbf', 30, 0, 1.2);
      }),
    );
  }

  get active(): boolean {
    return this.group.visible;
  }

  open(animalId: string, now: number): void {
    this.close();
    this.animalId = animalId;
    this.busy = false;
    const animal = this.session.sim.getAnimal(animalId);
    if (animal) {
      const spot = { x: PATIENT.x, z: PATIENT.z };
      const p = new AnimalActor(animal.id, `patient:${animal.id}`, spot, spot, now);
      p.ambles = false;
      p.sizeScale = VET_LAYOUT.patientScale;
      p.root.position.y = TABLE_TOP;
      this.patient = p;
      this.group.add(p.root);
    }
    this.group.visible = true;
    this.toolLayer.hidden = false;
    appBus.emit('sceneChanged', { scene: 'vet' });
  }

  close(): void {
    this.patient?.dispose();
    this.patient = null;
    this.group.visible = false;
    this.toolLayer.hidden = true;
  }

  resize(width: number): void {
    // The tools keep the original's size relative to the screen (never below 48 px targets).
    this.scale = width / WORLD_WIDTH;
    for (const [i, t] of this.tools.entries()) {
      const at = vetToolPoint(i);
      const { width: w, height: h } = VET_LAYOUT.tools;
      Object.assign(t.el.style, {
        left: `${(at.x / WORLD_WIDTH) * 100}%`,
        top: `${(at.y / WORLD_HEIGHT) * 100}%`,
        width: `${Math.max(96, w * this.scale)}px`,
        height: `${Math.max(88, h * this.scale)}px`,
      });
    }
  }

  update(ctx: FrameContext): void {
    if (!this.active) return;
    const animal = this.session.sim.getAnimal(this.animalId);
    const p = this.patient;
    if (animal && p) {
      p.sync(animal, this.session.sim.badges(animal.id), p.position, ctx.now, true);
      p.update({ ...ctx, cameraYaw: 0 });
      p.root.position.y = TABLE_TOP;
    }
    const waiting = this.session.sim.isWaitingAtClinic(this.animalId);
    const dim = waiting || !animal?.sickness;
    for (const t of this.tools) t.el.dataset.dim = String(dim);
  }

  dispose(): void {
    this.close();
    this.offs.forEach((off) => off());
    this.toolLayer.remove();
  }

  // ---- The room ---------------------------------------------------------------------------------

  private build(): void {
    const wall = new MeshToonMaterial({
      gradientMap: toonGradient(),
      map: stripes('#d9f1ea', '#c4e8de', true, [22, 1]),
    });
    const floor = new MeshToonMaterial({
      gradientMap: toonGradient(),
      map: stripes('#f3e6cf', '#e3d2b3', false, [1, 6]),
    });
    const back = new Mesh(new PlaneGeometry(40, WALL_H + 2), wall);
    back.position.set(0, (WALL_H + 2) / 2, BACK);
    const ground = new Mesh(new PlaneGeometry(40, 20), floor);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = BACK + 10;
    back.receiveShadow = ground.receiveShadow = true;

    // A window, a big friendly cross sign, and the exam table.
    const win = { x: toUnits(196 - WORLD_WIDTH / 2), y: 2.3 };
    const cross = { x: toUnits(560 - WORLD_WIDTH / 2), y: 2.4 };
    const table = VET_LAYOUT.table;
    const tx = toUnits(table.x + table.width / 2 - WORLD_WIDTH / 2);
    const tw = toUnits(table.width);
    const room = sceneryMesh(
      [
        part(new RoundedBoxGeometry(2.0, 1.5, 0.12, 2, 0.08), '#ffffff', {
          x: win.x,
          y: win.y,
          z: BACK + 0.06,
        }),
        part(new RoundedBoxGeometry(1.76, 1.26, 0.14, 2, 0.05), '#bfe3f5', {
          x: win.x,
          y: win.y,
          z: BACK + 0.08,
        }),
        part(new RoundedBoxGeometry(0.06, 1.26, 0.16, 1, 0.02), '#ffffff', {
          x: win.x,
          y: win.y,
          z: BACK + 0.09,
        }),
        part(new RoundedBoxGeometry(1.76, 0.06, 0.16, 1, 0.02), '#ffffff', {
          x: win.x,
          y: win.y,
          z: BACK + 0.09,
        }),
        part(new RoundedBoxGeometry(1.4, 1.4, 0.08, 2, 0.6), '#ffffff', {
          x: cross.x,
          y: cross.y,
          z: BACK + 0.05,
        }),
        part(new RoundedBoxGeometry(0.36, 1.0, 0.1, 2, 0.08), '#ef6f6f', {
          x: cross.x,
          y: cross.y,
          z: BACK + 0.08,
        }),
        part(new RoundedBoxGeometry(1.0, 0.36, 0.1, 2, 0.08), '#ef6f6f', {
          x: cross.x,
          y: cross.y,
          z: BACK + 0.08,
        }),
        part(new RoundedBoxGeometry(tw, 0.14, 1.3, 3, 0.07), '#ffffff', {
          x: tx,
          y: TABLE_TOP - 0.07,
          z: 0,
        }),
        part(new RoundedBoxGeometry(tw + 0.06, 0.05, 1.36, 2, 0.02), '#9db7c9', {
          x: tx,
          y: TABLE_TOP - 0.15,
          z: 0,
        }),
        ...[-1, 1].map((side) =>
          part(new RoundedBoxGeometry(0.22, TABLE_TOP - 0.15, 0.22, 2, 0.05), '#9db7c9', {
            x: tx + side * (tw / 2 - 0.5),
            y: (TABLE_TOP - 0.15) / 2,
            z: 0,
          }),
        ),
      ],
      { fade: false, shadows: true },
    );
    this.group.add(back, ground, room);

    const el = document.createElement('div');
    el.className = styles.title!;
    el.textContent = 'Vet Clinic';
    const title = new CSS2DObject(el);
    title.position.set(toUnits(410 - WORLD_WIDTH / 2), WALL_H * 0.93, BACK + 0.1);
    this.group.add(title);
  }

  // ---- Tools ------------------------------------------------------------------------------------

  private addTool(def: ExamToolDef): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = styles.tool!;
    el.setAttribute('data-testid', `vet-tool-${def.id}`);
    el.setAttribute('aria-label', def.name);
    el.innerHTML = `<span class="${styles.icon}" aria-hidden="true">${def.icon}</span><span class="${styles.name}">${def.name}</span>`;
    const tool: Tool = { def, el };
    this.tools.push(tool);
    this.toolLayer.append(el);

    // A tap uses the tool; so does dragging it onto the patient.
    let press: { x: number; y: number; id: number; dragging: boolean } | null = null;
    el.addEventListener('pointerdown', (e) => {
      press = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (!press.dragging && Math.hypot(dx, dy) < 10) return;
      press.dragging = true;
      el.dataset.dragging = 'true';
      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.08)`;
    });
    const up = (e: PointerEvent, cancelled: boolean) => {
      const p = press;
      press = null;
      if (!p || e.pointerId !== p.id) return;
      el.dataset.dragging = 'false';
      if (!p.dragging) {
        if (!cancelled) this.useTool(tool);
        return;
      }
      if (!cancelled && this.nearPatient(e.clientX, e.clientY)) this.useTool(tool);
      else this.returnTool(tool);
    };
    el.addEventListener('pointerup', (e) => up(e, false));
    el.addEventListener('pointercancel', (e) => up(e, true));
  }

  /** Where the patient's middle is (room space), for tests. */
  patientMiddle(): Point3 | null {
    if (!this.active || !this.patient) return null;
    return { x: PATIENT.x, y: TABLE_TOP + this.patient.height * 0.5, z: PATIENT.z };
  }

  private patientTop(): Point3 {
    const h = this.patient?.height ?? 1;
    return { x: PATIENT.x, y: TABLE_TOP + h, z: PATIENT.z };
  }

  private nearPatient(clientX: number, clientY: number): boolean {
    const r = this.host.getBoundingClientRect();
    const c = this.toCanvas({
      x: PATIENT.x,
      y: TABLE_TOP + (this.patient?.height ?? 1) * 0.5,
      z: PATIENT.z,
    });
    if (!c) return false;
    return (
      Math.hypot(clientX - r.left - c.x, clientY - r.top - c.y) < VET_LAYOUT.dropRadius * this.scale
    );
  }

  private returnTool(tool: Tool): void {
    tool.el.style.transition = this.reducedMotion()
      ? ''
      : 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    tool.el.style.transform = '';
    setTimeout(() => (tool.el.style.transition = ''), 300);
  }

  /** The tool goes to the patient, does its thing, then reports what it found. */
  private useTool(tool: Tool): void {
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
    const done = () => {
      this.busy = false;
      this.returnTool(tool);
      result.clues.forEach((clue, i) =>
        this.say(
          clue.icon,
          '#2f6f63',
          44,
          i * 150,
          0.35,
          (i - (result.clues.length - 1) / 2) * 0.7,
        ),
      );
      appBus.emit('vetExamined', { animalId: this.animalId, toolId: tool.def.id, result });
    };
    const still = this.reducedMotion();
    const target = this.toCanvas(this.patientTop());
    const r = this.host.getBoundingClientRect();
    const box = tool.el.getBoundingClientRect();
    if (still || !target || typeof tool.el.animate !== 'function') {
      done();
      return;
    }
    // Over to the patient's shoulder, a little wiggle, then back.
    const dx = r.left + target.x + 70 * this.scale - (box.left + box.width / 2);
    const dy = r.top + target.y + 40 * this.scale - (box.top + box.height / 2);
    const at = (deg: number) =>
      `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${deg}deg)`;
    const animation = tool.el.animate(
      [
        { transform: 'translate(-50%, -50%)' },
        { transform: at(0), offset: 0.4 },
        { transform: at(-14), offset: 0.55 },
        { transform: at(0), offset: 0.7 },
        { transform: at(-14), offset: 0.85 },
        { transform: at(0) },
      ],
      { duration: 700, easing: 'ease-out' },
    );
    animation.onfinish = done;
    animation.oncancel = done;
  }

  /** Text floating up over the patient. */
  private say(
    text: string,
    color: string,
    size: number,
    delay: number,
    above: number,
    dx = 0,
  ): void {
    const top = this.patientTop();
    this.fx.floatText(
      this.group,
      { x: top.x + dx, y: top.y + above, z: top.z },
      text,
      color,
      size,
      delay,
    );
  }

  private showTreatment(treatmentId: string, cured: boolean, helped: boolean): void {
    const top = this.patientTop();
    const icon = getTreatment(treatmentId)?.icon ?? '💊';
    this.say(icon, '#2f6f63', 54, 0, 0.3);
    if (helped && !cured) {
      this.fx.burst(this.group, { ...top, y: top.y - 0.4 }, [0xffd84d, 0x9fe7ff, 0xffffff], 8);
      this.say('1 more!', '#3f7fbf', 36, 200, 0.7, 0.9);
      return;
    }
    if (cured) {
      this.fx.burst(
        this.group,
        { ...top, y: top.y - 0.4 },
        [0xffd84d, 0xff9fc4, 0x9fe7ff, 0xffffff],
        14,
      );
      this.fx.hearts(this.group, { ...top, y: top.y + 0.2 }, 5);
      this.patient?.perform('jump', performance.now(), this.reducedMotion());
      return;
    }
    this.say('?', '#4a3b33', 60, 200, 0.7, 0.9);
    this.patient?.perform('wave', performance.now(), this.reducedMotion());
  }
}
