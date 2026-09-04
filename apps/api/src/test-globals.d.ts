/// <reference types="bun-types/test-globals" />
import type { Mock } from 'bun:test';

declare global {
  namespace jest {
    /**
     * Sustituto de jest.Mocked (ausente en bun:test): convierte cada
     * método en su Mock tipado. Suficiente para los providers useValue.
     */
    type Mocked<T extends object> = {
      [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? Mock<(...args: A) => R>
        : T[K];
    };
  }
}

export {};
