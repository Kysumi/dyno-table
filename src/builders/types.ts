// https://github.com/react-hook-form/react-hook-form/blob/master/src/types/path/eager.ts

type Primitive = null | undefined | string | number | boolean | symbol | bigint;

type IsEqual<T1, T2> = T1 extends T2
  ? (<G>() => G extends T1 ? 1 : 2) extends <G>() => G extends T2 ? 1 : 2
    ? true
    : false
  : false;

interface File extends Blob {
  readonly lastModified: number;
  readonly name: string;
}

interface FileList {
  readonly length: number;
  item(index: number): File | null;
  [index: number]: File;
}

type BrowserNativeObject = Date | FileList | File;

// biome-ignore lint/suspicious/noExplicitAny: RHF
type IsTuple<T extends ReadonlyArray<any>> = number extends T["length"] ? false : true;

// biome-ignore lint/suspicious/noExplicitAny: RHF
type TupleKeys<T extends ReadonlyArray<any>> = Exclude<keyof T, keyof any[]>;

type AnyIsEqual<T1, T2> = T1 extends T2 ? (IsEqual<T1, T2> extends true ? true : never) : never;

type PathImpl<K extends string | number, V, TraversedTypes> = V extends Primitive | BrowserNativeObject
  ? `${K}`
  : true extends AnyIsEqual<TraversedTypes, V>
    ? `${K}`
    : `${K}` | `${K}.${PathInternal<V, TraversedTypes | V>}`;

type ArrayKey = number;

type PathInternal<T, TraversedTypes = T> = T extends ReadonlyArray<infer V>
  ? IsTuple<T> extends true
    ? {
        [K in TupleKeys<T>]-?: PathImpl<K & string, T[K], TraversedTypes>;
      }[TupleKeys<T>]
    : PathImpl<ArrayKey, V, TraversedTypes>
  : {
      [K in keyof T]-?: PathImpl<K & string, T[K], TraversedTypes>;
    }[keyof T];

// biome-ignore lint/suspicious/noExplicitAny: RHF
export type Path<T> = T extends any ? PathInternal<T> : never;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type PathType<T, K extends keyof any> = K extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      Rest extends keyof any
      ? PathType<T[Key], Rest>
      : never
    : never
  : K extends keyof T
    ? T[K]
    : never;
