import AwaitedHandler, { NotImplementedError } from 'awaited-dom/base/AwaitedHandler';
import AwaitedPath, { IJsPath } from 'awaited-dom/base/AwaitedPath';
import Constructable from 'awaited-dom/base/Constructable';
import IAttachedState from 'awaited-dom/base/IAttachedState';
import IExecJsPathResult from '@secret-agent/core-interfaces/IExecJsPathResult';
import getAttachedStateFnName from '@secret-agent/core-interfaces/getAttachedStateFnName';
import IAwaitedOptions from '../interfaces/IAwaitedOptions';
import CoreFrameEnvironment from './CoreFrameEnvironment';

// Sets up AwaitedHandler initializer hooks. See Noderdom/AwaitedDOM
AwaitedHandler.delegate = {
  getProperty,
  setProperty,
  construct,
  runMethod,
  runStatic,
  loadState,
};

export async function getProperty<T, TClass>(
  self: AwaitedHandler<TClass>,
  instance: TClass,
  name: string,
): Promise<T> {
  const state = self.getState(instance);
  await awaitRemoteInitializer(state);
  const awaitedPath = state.awaitedPath as AwaitedPath;
  const { coreFrame } = state.awaitedOptions as IAwaitedOptions;
  const awaitedCoreFrame = await coreFrame;
  const finalPath = awaitedPath.addProperty(name).toJSON();
  const result = await execJsPath<TClass, T>(self, awaitedCoreFrame, instance, finalPath);

  return cleanResult(self, instance, result);
}

export async function setProperty<T, TClass>(
  self: AwaitedHandler<TClass>,
  instance: TClass,
  name: string,
  value: T,
): Promise<void> {
  await awaitRemoteInitializer(self.getState(instance));
  self.setState(instance, { [name]: value });
}

export async function runMethod<T, TClass>(
  self: AwaitedHandler<TClass>,
  instance: TClass,
  name: string,
  args: any[],
): Promise<T> {
  await awaitRemoteInitializer(instance);
  const state = self.getState(instance);
  const awaitedPath = state.awaitedPath as AwaitedPath;
  const { coreFrame } = state.awaitedOptions as IAwaitedOptions;
  const awaitedCoreFrame = await coreFrame;
  const finalPath = awaitedPath.addMethod(name, ...args).toJSON();
  const result = await execJsPath<TClass, T>(self, awaitedCoreFrame, instance, finalPath);
  return cleanResult(self, instance, result);
}

export async function loadState<TClass>(
  self: AwaitedHandler<TClass>,
  instance: TClass,
  properties?: string[],
): Promise<IAttachedState> {
  await awaitRemoteInitializer(instance);
  const state = self.getState(instance);
  const awaitedPath = state.awaitedPath as AwaitedPath;
  const { coreFrame } = state.awaitedOptions as IAwaitedOptions;
  const awaitedCoreFrame = await coreFrame;
  const finalPath = awaitedPath.addMethod(getAttachedStateFnName, properties).toJSON();
  const result = await execJsPath<TClass, null>(self, awaitedCoreFrame, instance, finalPath);

  return result?.attachedState as IAttachedState;
}

export function runStatic<T, TClass>(
  self: AwaitedHandler<TClass>,
  _klass: Constructable<TClass>,
  name: string,
): T {
  throw new NotImplementedError(`${self.className}.${name} static method not implemented`);
}

export function construct<TClass>(self: AwaitedHandler<TClass>): TClass {
  throw new NotImplementedError(`${self.className} constructor not implemented`);
}

export function getAwaitedPathAsMethodArg(awaitedPath: AwaitedPath): string {
  return `$$jsPath=${JSON.stringify(awaitedPath.toJSON())}`;
}

function execJsPath<TClass, T>(
  self: AwaitedHandler<TClass>,
  coreFrame: CoreFrameEnvironment,
  instance: TClass,
  path: IJsPath,
): Promise<IExecJsPathResult<T>> {
  for (const part of path) {
    // if part is method call, see if any params need to be remotely initialized first
    if (Array.isArray(part)) {
      for (let i = 0; i < part.length; i += 1) {
        const param = part[i];
        if (!param) continue;
        if (typeof param === 'object') {
          const awaitedPath = self.getState(param)?.awaitedPath;
          if (awaitedPath) {
            part[i] = getAwaitedPathAsMethodArg(awaitedPath);
          }
        }
      }
    }
  }
  return coreFrame.execJsPath<T>(path);
}

function cleanResult<T, TClass>(
  self: AwaitedHandler<TClass>,
  instance: TClass,
  result: IExecJsPathResult<T>,
): T {
  if (!result) return null;
  if (!result?.attachedState) return result?.value;

  self.setState(instance, {
    attachedState: result.attachedState,
  });
  delete result.attachedState;

  return result.value;
}

async function awaitRemoteInitializer(state: any): Promise<void> {
  if (state?.remoteInitializerPromise) {
    await state.remoteInitializerPromise;
  }
}
