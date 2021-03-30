import { IncomingMessage } from 'http';
import Logger from '@secret-agent/commons/Logger';
import { createPromise } from '@secret-agent/commons/utils';
import ResourceType from '@secret-agent/core-interfaces/ResourceType';
import SessionDb, { ISessionLookup, ISessionLookupArgs } from '../dbs/SessionDb';
import CommandFormatter from '../lib/CommandFormatter';
import { ISessionRecord } from '../models/SessionTable';
import { MouseEventType } from '../models/MouseEventsTable';

const { log } = Logger(module);

export default class ConnectionToReplay {
  private readonly lookupArgs: ISessionLookupArgs;
  private sessionLookup: ISessionLookup;

  private readonly pendingPushes: Promise<any>[] = [];
  private readonly sessionClosedPromise = createPromise();

  private session: ISessionRecord;
  private tabsById = new Map<
    number,
    { tabId: number; createdTime: string; startOrigin: string; width: number; height: number }
  >();

  private readonly frameIdToNodePath = new Map<string, string>();
  private readonly mainFrames = new Set<string>();

  private lastScriptState: IScriptState;

  constructor(readonly sendMessage: (data: string) => Promise<unknown>, request: IncomingMessage) {
    this.pendingPushes.push(this.sessionClosedPromise.promise);
    const { headers } = request;
    this.lookupArgs = {
      scriptInstanceId: headers['script-instance-id'] as string,
      scriptEntrypoint: headers['script-entrypoint'] as string,
      sessionName: headers['session-name'] as string,
      dataLocation: headers['data-location'] as string,
      sessionId: headers['session-id'] as string,
    };
  }

  public async handleRequest(): Promise<void> {
    try {
      log.stats('ReplayApi', this.lookupArgs);

      this.sessionLookup = SessionDb.findWithRelated(this.lookupArgs);

      this.subscribeToTables();

      let resolved = -1;
      // sort of complicated, but we're checking that everything has been sent and completed
      while (this.pendingPushes.length > resolved) {
        resolved = this.pendingPushes.length;
        await Promise.all([...this.pendingPushes]).catch(() => null);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await this.send('trailer', { messages: this.pendingPushes.length });
    } catch (error) {
      await this.send('error', { message: error.message });
      log.error('SessionState.ErrorLoadingSession', {
        error,
        ...this.lookupArgs,
      });
    }
    // do one last wait to catch errors and everything else
    await Promise.all(this.pendingPushes).catch(() => null);
  }

  public close(error?: Error) {
    if (!this.sessionLookup) return;

    const db = this.sessionLookup.sessionDb;
    db.unsubscribeToChanges();
    // don't close a live db
    if (db.readonly) {
      setImmediate(() => db.close());
    }
    log.stats('ConnectionToReplay.Closed', { error, sessionId: this.lookupArgs.sessionId });
  }

  private subscribeToTables(): void {
    if (!this.sessionLookup) {
      log.error('Replay Api Error - no session found for script', this.lookupArgs);
      throw new Error("There aren't any stored sessions for this script.");
    }

    const sessionLookup = this.sessionLookup;
    const db = sessionLookup.sessionDb;
    this.session = db.session.get();

    db.tabs.subscribe(tabs => {
      for (const tab of tabs) {
        if (!this.tabsById.has(tab.tabId)) {
          this.addTabId(tab.tabId, tab.createdTime);
        }
        const sessionTab = this.tabsById.get(tab.tabId);
        sessionTab.height = tab.viewportHeight;
        sessionTab.width = tab.viewportWidth;
      }
    });

    db.frames.subscribe(frames => {
      for (const frame of frames) {
        if (!frame.parentId) {
          this.mainFrames.add(frame.id);
          this.frameIdToNodePath.set(frame.id, 'main');
        } else {
          const parentPath = this.frameIdToNodePath.get(frame.parentId);
          this.frameIdToNodePath.set(frame.id, `${parentPath ?? ''}_${frame.domNodeId}`);
        }
        this.addTabId(frame.tabId, frame.createdTime);
      }
    });

    const tabReadyPromise = createPromise<void>();
    this.pendingPushes.push(tabReadyPromise.promise);

    db.domChanges.subscribe(changes => {
      for (const change of changes) {
        const isMainFrame = this.mainFrames.has(change.frameId);
        if (isMainFrame && change.action === 'newDocument') {
          this.addTabId(change.tabId, change.timestamp);
          const tab = this.tabsById.get(change.tabId);
          if (!tab.startOrigin) {
            tab.startOrigin = change.textContent;
          }
          if (!tabReadyPromise.isResolved) {
            this.send('session', {
              ...this.session,
              tabs: [...this.tabsById.values()],
              dataLocation: this.sessionLookup.dataLocation,
              relatedScriptInstances: this.sessionLookup.relatedScriptInstances,
              relatedSessions: this.sessionLookup.relatedSessions,
            });
            tabReadyPromise.resolve();
          }
        }
        (change as any).frameIdPath = this.frameIdToNodePath.get(change.frameId);
        if (change.attributes) change.attributes = JSON.parse(change.attributes);
        if (change.attributeNamespaces) {
          change.attributeNamespaces = JSON.parse(change.attributeNamespaces);
        }
        if (change.properties) change.properties = JSON.parse(change.properties);
      }
      if (changes.length) this.send('dom-changes', changes);
    });

    db.commands.subscribe(commands => {
      for (const command of commands) this.addTabId(command.tabId, command.startDate);
      const commandsWithResults = commands.map(CommandFormatter.parseResult);
      this.send('commands', commandsWithResults);
      this.checkState();
    });

    const mouseFilter = [MouseEventType.MOVE, MouseEventType.DOWN, MouseEventType.UP];
    db.mouseEvents.subscribe(mouseEvents => {
      const toPublish = mouseEvents.filter(x => mouseFilter.includes(x.event));
      if (toPublish.length) this.send('mouse-events', toPublish);
    });

    db.scrollEvents.subscribe(scroll => {
      this.send('scroll-events', scroll);
    });

    db.focusEvents.subscribe(events => {
      this.send('focus-events', events);
    });

    const resourceWhitelist: ResourceType[] = [
      'Ico',
      'Image',
      'Media',
      'Font',
      'Stylesheet',
      'Other',
      'Document',
    ];
    db.resources.subscribe(resources => {
      const resourcesToSend = [];
      for (const resource of resources) {
        if (!resourceWhitelist.includes(resource.type)) {
          continue;
        }
        resourcesToSend.push({
          url: resource.requestUrl,
          tabId: resource.tabId,
          type: resource.type,
          data: resource.responseData,
          encoding: resource.responseEncoding,
          statusCode: resource.statusCode,
          headers: resource.responseHeaders ? JSON.parse(resource.responseHeaders) : {},
        });
      }
      while (resourcesToSend.length) {
        const toSend = resourcesToSend.splice(0, 50);
        this.send('resources', toSend);
      }
    });

    db.frameNavigations.subscribe(() => this.checkState());
    db.session.subscribe(() => this.checkState());
    this.checkState();
    if (this.session.closeDate) {
      setImmediate(() => this.sessionClosedPromise.resolve());
    }
  }

  private checkState(): void {
    if (!this.sessionLookup?.sessionState) return;
    const scriptState = this.sessionLookup.sessionState.checkForResponsive();

    if (scriptState.closeDate && !this.sessionClosedPromise.isResolved) {
      this.send('script-state', scriptState);
      // give sqlite time to flush out published changes
      setTimeout(() => this.sessionClosedPromise.resolve(), 500);
      return;
    }

    this.lastScriptState = scriptState;
    const lastState = <IScriptState>{ ...(this.lastScriptState ?? {}) };
    if (
      lastState.hasRecentErrors !== scriptState.hasRecentErrors ||
      lastState.closeDate !== scriptState.closeDate ||
      lastState.lastActivityDate?.getTime() !== scriptState.lastActivityDate?.getTime() ||
      lastState.lastCommandName !== scriptState.lastCommandName
    ) {
      this.send('script-state', scriptState);
    }
  }

  private addTabId(tabId: number, timestamp: string): void {
    if (!this.tabsById.has(tabId)) {
      this.tabsById.set(tabId, {
        tabId,
        createdTime: timestamp,
        startOrigin: null,
        width: null,
        height: null,
      });
    }
  }

  private send(event: string, data: any): void {
    if (Array.isArray(data) && data.length === 0) {
      return;
    }

    const json = JSON.stringify({ event, data }, (_, value) => {
      if (value !== undefined) return value;
    });

    const sendPromise = this.sendMessage(json).catch(err => err);
    if (sendPromise) this.pendingPushes.push(sendPromise);
  }
}

interface IScriptState {
  lastCommandName: string;
  lastActivityDate: Date;
  hasRecentErrors: boolean;
  closeDate?: Date;
}
