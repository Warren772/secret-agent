if (args.userAgentString && self.navigator?.userAgent !== args.userAgentString) {
  proxyGetter(self.navigator, 'userAgent', () => args.userAgentString, true);
  proxyGetter(
    self.navigator,
    'appVersion',
    () => args.userAgentString.replace('Mozilla/', ''),
    true,
  );
}
if (args.platform && self.navigator?.platform !== args.platform) {
  proxyGetter(self.navigator, 'platform', () => args.platform, true);
}

if ('setAppBadge' in self.navigator) {
  proxyFunction(self.navigator, 'setAppBadge', (target, thisArg, argArray) => {
    let error: TypeError;
    if (argArray.length) {
      const arg = argArray[0];
      if (typeof arg === 'number') {
        if (arg < 0 || arg > Number.MAX_SAFE_INTEGER) {
          error = new TypeError(
            `Failed to execute 'setAppBadge' on 'Navigator': Value is outside the 'unsigned long long' value range.`,
          );
        }
      } else {
        error = new TypeError(
          `Failed to execute 'setAppBadge' on 'Navigator': Value is not of type 'unsigned long long'.`,
        );
      }
    }
    if (error) return Promise.reject(cleanErrorStack(error));
    return Promise.resolve(undefined);
  });
}

if ('clearAppBadge' in self.navigator) {
  proxyFunction(self.navigator, 'clearAppBadge', (target, thisArg, argArray) => {
    return Promise.resolve(undefined);
  });
}

if (args.headless === true && 'requestMediaKeySystemAccess' in self.navigator) {
  proxyFunction(self.navigator, 'requestMediaKeySystemAccess', (target, thisArg, argArray) => {
    if (argArray.length < 2) {
      return ProxyOverride.callOriginal;
    }
    const [keySystem, configs] = argArray;
    if (keySystem !== 'com.widevine.alpha' || [...configs].length < 1) {
      return ProxyOverride.callOriginal;
    }
    return target
      .call(thisArg, 'org.w3.clearkey', configs)
      .then(x => {
        proxyGetter(x, 'keySystem', () => keySystem);
        return x;
      })
      .catch(err => cleanErrorStack(err));
  });
}
