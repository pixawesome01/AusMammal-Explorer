const fs = require('node:fs');
const path = require('node:path');

// Temporary workaround: https://github.com/expo/expo/issues/49426
// Apple compilers reject returns-retained annotations on these constructors.
// Preserve the class shared-reference annotation and retain/release methods.
const header = path.join(
  path.dirname(require.resolve('expo-modules-jsi/package.json')),
  'apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h',
);
const source = fs.readFileSync(header, 'utf8');
if (!source.includes('SWIFT_SHARED_REFERENCE(retainRuntimeScheduler, releaseRuntimeScheduler)')) {
  throw new Error('Expo RuntimeScheduler header changed; review the compatibility workaround.');
}
const patched = source.replaceAll('SWIFT_RETURNS_RETAINED RuntimeScheduler(', 'RuntimeScheduler(');
if (patched !== source) {
  fs.writeFileSync(header, patched);
  console.log('Applied Expo RuntimeScheduler compatibility fix.');
} else {
  console.log('Expo RuntimeScheduler constructors need no compatibility fix.');
}

// Xcode 26.2 loses the outer nonisolated(unsafe) pointer declarations across
// withGuaranteedContext's closure. Repeat them at the actor boundary. Both
// withGuaranteedContext and assumeIsolated are synchronous and nonescaping;
// pointers remain valid for the duration of the existing JSI callback.
const runtimeFile = path.join(
  path.dirname(require.resolve('expo-modules-jsi/package.json')),
  'apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift',
);
let runtime = fs.readFileSync(runtimeFile, 'utf8');
const originalRuntime = runtime;
for (const [context, pointers, indent] of [
  ['HostObjectContext', ['resultPtr'], '      '],
  ['HostFunctionContext', ['thisPtr', 'argumentsPtr', 'resultPtr'], '    '],
  ['UnownedThisHostFunctionContext', ['thisPtr', 'argumentsPtr', 'resultPtr'], '    '],
]) {
  const start = `return withGuaranteedContext(context) { (context: ${context}, runtime) in\n`;
  const actor = `${indent}  return JavaScriptActor.assumeIsolated {`;
  const before = start + actor;
  const after = start + pointers.map(name =>
    `${indent}  nonisolated(unsafe) let ${name} = ${name}\n`).join('') + actor;
  if (runtime.includes(after)) continue;
  if (runtime.split(before).length !== 2) {
    throw new Error(`Expo ${context} callback changed; review the Swift compatibility workaround.`);
  }
  runtime = runtime.replace(before, after);
}
if (runtime !== originalRuntime) fs.writeFileSync(runtimeFile, runtime);
console.log('Expo synchronous callback compatibility fix verified.');
