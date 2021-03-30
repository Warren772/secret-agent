import { IBoundLog } from '@secret-agent/core-interfaces/ILog';
import Log from '@secret-agent/commons/Logger';
import ICommandMeta from '../../core-interfaces/ICommandMeta';
import Tab from './Tab';

const { log } = Log(module);
type AsyncFunc = (...args: any[]) => Promise<any>;

export default class CommandRecorder {
  public readonly fnNames = new Set<string>();
  private logger: IBoundLog;
  constructor(readonly owner: any, readonly tab: Tab, readonly frameId: string, fns: AsyncFunc[]) {
    for (const fn of fns) {
      owner[fn.name] = ((...args) => this.runCommandFn(fn, ...args)) as any;
      this.fnNames.add(fn.name);
    }
    this.logger = log.createChild(module, {
      tabId: tab.id,
      sessionId: tab.session.id,
      frameId,
    });
  }

  private async runCommandFn<T>(fn: AsyncFunc, ...args: any[]): Promise<T> {
    if (!this.fnNames.has(fn.name)) throw new Error(`Unsupported function requested ${fn.name}`);

    const { tab } = this;
    const sessionState = tab.sessionState;
    const commandHistory = sessionState.commands;

    const commandMeta = {
      id: commandHistory.length + 1,
      tabId: tab.id,
      frameId: this.frameId,
      name: fn.name,
      args: args.length ? JSON.stringify(args) : undefined,
    } as ICommandMeta;

    // TODO: figure out where we end up getting navigations from
    const frame = tab.frameEnvironmentsById.get(this.frameId);
    frame.navigationsObserver.willRunCommand(commandMeta, commandHistory);

    if (fn.name !== 'goto') {
      await tab.domRecorder.setCommandIdForPage(commandMeta.id);
    }
    const id = this.logger.info('Command.run', commandMeta);

    let result: T;
    try {
      commandMeta.startDate = new Date().toISOString();
      sessionState.recordCommandStart(commandMeta);

      result = await fn.call(this.owner, ...args);
      return result;
    } catch (err) {
      result = err;
      throw err;
    } finally {
      commandMeta.endDate = new Date().toISOString();
      commandMeta.result = result;
      // NOTE: second insert on purpose -- it will do an update
      sessionState.recordCommandFinished(commandMeta);
      this.logger.stats('Command.done', { result, parentLogId: id });
    }
  }
}
