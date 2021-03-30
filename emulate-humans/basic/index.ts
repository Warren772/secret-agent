import { IInteractionGroups, IInteractionStep } from '@secret-agent/core-interfaces/IInteractions';
import { HumanEmulatorClassDecorator } from '@secret-agent/core-interfaces/IHumanEmulatorClass';

@HumanEmulatorClassDecorator
export default class HumanEmulatorBasic {
  public static id = 'basic';

  public async playInteractions(
    interactionGroups: IInteractionGroups,
    run: (interactionStep: IInteractionStep) => Promise<void>,
  ) {
    for (let i = 0; i < interactionGroups.length; i += 1) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      for (const interactionStep of interactionGroups[i]) {
        await run(interactionStep);
      }
    }
  }
}
