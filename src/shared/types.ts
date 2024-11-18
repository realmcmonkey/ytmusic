export type WindowsEventArguments = {
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
};

export enum YTMViewStatus {
  Loading,
  Hooking,
  Ready
}

export enum YTMViewSetupCompletionFlags {
  Early = 1,
  Styles = 2,
  Navigation = 4,
  Hooks = 8,
  Remote = 16,
  Extras = 32
}
export const AllYTMViewSetupCompletionFlags = (Object.values(YTMViewSetupCompletionFlags) as YTMViewSetupCompletionFlags[]).reduce(
  (prev, curr) => prev | curr,
  0
);
export const YTMViewSetupCompletionFlagsNames = Object.keys(YTMViewSetupCompletionFlags).filter(key => isNaN(Number(key))) as Array<
  keyof typeof YTMViewSetupCompletionFlags
>;

export type Paths<T> = T extends object
  ? { [K in keyof T]: Exclude<K, symbol> extends string ? `${Exclude<K, symbol>}${"" | `.${Paths<T[K]>}`}` : never }[keyof T]
  : never;
export type ValueAtPath<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? ValueAtPath<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;
