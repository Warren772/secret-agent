import { pickRandom } from '@secret-agent/commons/utils';
import IHumanEmulatorClass from '@secret-agent/core-interfaces/IHumanEmulatorClass';
import HumanEmulatorGhost from '@secret-agent/emulate-humans-ghost';

export default class HumanEmulators {
  private static readonly emulatorsById: { [id: string]: IHumanEmulatorClass } = {};

  public static load(HumanEmulatorClass: IHumanEmulatorClass) {
    this.emulatorsById[HumanEmulatorClass.id] = HumanEmulatorClass;
  }

  public static create(id: string) {
    let EmulatorClass = this.emulatorsById[id];
    if (!EmulatorClass) {
      const fromShortId = `@secret-agent/emulate-humans-${id}`;
      try {
        // eslint-disable-next-line global-require,import/no-dynamic-require
        EmulatorClass = require(fromShortId)?.default;
      } catch (err) {
        // try as full package name
        // eslint-disable-next-line global-require,import/no-dynamic-require
        EmulatorClass = require(id)?.default;
      }
      if (EmulatorClass) this.load(EmulatorClass);
    }
    if (!EmulatorClass) {
      throw new Error(`HumanEmulator could not be found: ${id}`);
    }
    return new EmulatorClass();
  }

  public static getRandomId() {
    const pluginIds = Object.keys(this.emulatorsById);
    return pickRandom(pluginIds);
  }
}

HumanEmulators.load(HumanEmulatorGhost);
