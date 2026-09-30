import Phaser from 'phaser';
import { RARITY_STYLE, parseHex } from '../../art/palette';
import { appBus } from '../../bridge/appBus';
import type { GameSession } from '../../bridge/gameSession';
import { BALANCE } from '../../config/balance';
import { HOUSE_COLORS } from '../../config/houseColors';
import { TEXT_RESOLUTION } from '../constants';
import {
  GATE_ENTRY,
  HOUSE_DOOR,
  HUD_COINS,
  LAYOUT,
  gateSlot,
  yardToWorld,
  zoneToWorld,
} from '../layout';

/** Where Scoop Bot waits between jobs: by the fence, left of the gate. */
const SCOOP_PARK = { x: 1040, y: LAYOUT.fenceY + 70 };
import { drawHouse, drawYard } from '../sprites/drawYard';
import { FindSprite } from '../sprites/FindSprite';
import { VisitorSprite } from '../sprites/VisitorSprite';
import { ZoneScene } from './ZoneScene';

/**
 * The yard (DESIGN 17.1 World): the shared zone behavior plus mystery visitors at the gate and
 * the house exterior (its door is where animals go inside).
 */
export class YardScene extends ZoneScene {
  protected readonly zone = 'yard';
  private readonly visitors = new Map<string, VisitorSprite>();
  private readonly leftGate = new Set<string>();
  private readonly finds = new Map<string, FindSprite>();
  /** Finds the player just tapped (vs. ones that floated away). */
  private readonly collected = new Set<string>();
  private house!: Phaser.GameObjects.Graphics;
  private houseLook = '';
  /** Scoop Bot (placeholder: an emoji robot), shown once bought. Parks by the fence. */
  private scoopBot!: Phaser.GameObjects.Text;

  constructor(session: GameSession) {
    super('Yard', session);
  }

  override create(): void {
    super.create();
    const { events } = this.session.sim;
    const offs = [
      events.on('visitorEntered', ({ visitorId, animal }) => {
        const from = this.visitors.get(visitorId);
        this.spawnFrom.set(animal.id, {
          at: from ? { x: from.x, y: from.y } : GATE_ENTRY,
          kind: 'walk',
        });
      }),
      events.on('visitorLeft', ({ visitor }) => this.leftGate.add(visitor.id)),
      events.on('visitorRevealed', ({ visitor }) => {
        const sprite = this.visitors.get(visitor.id);
        if (!sprite) return;
        const { rarity, isSparkle } = visitor.roll;
        const style = RARITY_STYLE[rarity];
        this.fx.puff(sprite.x, sprite.y - 30);
        this.fx.burst(sprite.x, sprite.y - 30, [style.hex, 0xffd84d, 0xffffff], 12);
        // Rarer finds get a bigger party.
        const big = isSparkle || rarity === 'rare' || rarity === 'epic' || rarity === 'legendary';
        if (big)
          this.fx.confetti(sprite.x, sprite.y - 60, isSparkle || rarity === 'legendary' ? 24 : 14);
        if (isSparkle) this.fx.banner(sprite.x, sprite.y - 150, '✦ Sparkle! ✦', '#c2489a');
        else if (rarity === 'epic' || rarity === 'legendary')
          this.fx.banner(sprite.x, sprite.y - 150, `${style.label}!`, style.color);
      }),
      events.on('findCollected', ({ find, coins }) => {
        this.collected.add(find.id);
        const sprite = this.finds.get(find.id);
        if (!sprite) return;
        this.fx.floatText(sprite.x, sprite.y - 50, `+${coins} 🪙`, '#c98a00', 30);
        this.fx.burst(sprite.x, sprite.y, [0xffd84d, 0xffffff, 0x9ff0c8], 8);
        this.fx.coinShower(sprite.x, sprite.y, HUD_COINS, Math.min(coins, 5));
      }),
      events.on('poopCleaned', ({ poop, by }) => {
        if (by === 'scoopBot' && poop.zone === 'yard')
          this.scoop(zoneToWorld('yard', poop.position));
      }),
      events.on('houseUpgraded', () => {
        const { x, y, width, height } = LAYOUT.house;
        this.fx.burst(x + width / 2, y + height / 2, [0xffd84d, 0xff9fc4, 0x9fe7ff, 0xffffff], 16);
        this.fx.hearts(x + width / 2, y + 40, 5);
      }),
      // Back from Storage: pops out of the house door.
      events.on('petRetrieved', ({ animal }) =>
        this.spawnFrom.set(animal.id, { at: HOUSE_DOOR, kind: 'pop' }),
      ),
    ];
    const unsubscribe = () => offs.forEach((off) => off());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Phaser.Scenes.Events.DESTROY, unsubscribe);
    appBus.emit('sceneChanged', { scene: 'yard' });
    appBus.emit('worldReady', undefined);
  }

  protected drawBackground(): void {
    drawYard(this);
    this.house = this.add.graphics().setDepth(0);
    this.scoopBot = this.add
      .text(SCOOP_PARK.x, SCOOP_PARK.y, '🤖', { fontSize: '44px', resolution: TEXT_RESOLUTION })
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  private syncScoopBot(): void {
    this.scoopBot.setVisible(this.session.sim.hasHelper('scoopBot'));
    if (!this.tweens.isTweening(this.scoopBot)) this.scoopBot.setDepth(this.scoopBot.y);
  }

  /** Scoop Bot zips to the poop, gives it a sparkle, and comes back to park. */
  private scoop(at: { x: number; y: number }): void {
    const bot = this.scoopBot;
    this.tweens.killTweensOf(bot);
    if (this.reducedMotion()) {
      this.fx.burst(at.x, at.y - 10, [0x9fe7ff, 0xffffff], 6);
      return;
    }
    bot.setDepth(10_000);
    this.tweens.chain({
      targets: bot,
      tweens: [
        { x: at.x, y: at.y + 10, duration: 500, ease: 'Sine.easeInOut' },
        { angle: 15, duration: 90, yoyo: true, repeat: 2 },
        { x: SCOOP_PARK.x, y: SCOOP_PARK.y, duration: 600, ease: 'Sine.easeInOut', delay: 150 },
      ],
    });
    this.time.delayedCall(560, () => this.fx.burst(at.x, at.y - 10, [0x9fe7ff, 0xffffff], 6));
  }

  protected reconcileExtra(): void {
    const world = this.session.sim.state.world;
    const look = `${world.house.exteriorColor}|${world.house.tierId}`;
    if (look !== this.houseLook) {
      this.houseLook = look;
      const def = HOUSE_COLORS.find((c) => c.id === world.house.exteriorColor) ?? HOUSE_COLORS[0]!;
      const tier = BALANCE.houseTiers.findIndex((t) => t.id === world.house.tierId);
      drawHouse(this.house, parseHex(def.color), Math.max(0, tier));
    }
    this.syncScoopBot();
    this.reconcileVisitors();
    this.reconcileFinds();
  }

  /** Coins, clovers, and butterflies to tap (early-game pass). */
  private reconcileFinds(): void {
    const present = new Set<string>();
    for (const find of this.session.sim.state.world.finds) {
      present.add(find.id);
      if (this.finds.has(find.id)) continue;
      const sprite = new FindSprite(this, find, yardToWorld(find.position), this.reducedMotion);
      sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        if (!this.decorating) this.session.sim.collectFind(find.id);
      });
      this.finds.set(find.id, sprite);
    }
    for (const [id, sprite] of this.finds) {
      if (present.has(id)) continue;
      this.finds.delete(id);
      if (this.collected.delete(id)) sprite.collect();
      else sprite.fadeAway();
    }
    // Hidden while decorating, like the animals fade.
    for (const sprite of this.finds.values()) sprite.setVisible(!this.decorating);
  }

  private reconcileVisitors(): void {
    const queued = new Set<string>();
    this.session.sim.state.world.gateQueue.forEach((visitor, i) => {
      queued.add(visitor.id);
      const slot = gateSlot(i);
      let sprite = this.visitors.get(visitor.id);
      if (!sprite) {
        const s = new VisitorSprite(this, visitor, slot, this.reducedMotion);
        s.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
          if (!s.isRevealed) this.session.sim.revealVisitor(visitor.id);
        });
        sprite = s;
        this.visitors.set(visitor.id, sprite);
      }
      sprite.sync(visitor, slot);
    });
    for (const [id, sprite] of this.visitors) {
      if (queued.has(id)) continue;
      this.visitors.delete(id);
      if (this.leftGate.delete(id)) sprite.leave();
      else sprite.destroy(); // Walked in: the animal sprite takes over from here.
    }
  }
}
