import { buildBootstrapFailureLog } from './bootstrap-failure';

// Este spec es el mecanismo de enforcing del contrato de logging del arranque:
// si alguien reintroduce `err.message` / `String(err)` en el payload, falla acá.
describe('buildBootstrapFailureLog', () => {
  it('no filtra el mensaje crudo de un error con un secreto', () => {
    const payload = buildBootstrapFailureLog(
      new Error('Falta la variable RESEND_API_KEY=re_abc123'),
    );

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('RESEND_API_KEY');
    expect(serialized).not.toContain('re_abc123');
    expect(serialized).not.toContain('Falta la variable');
  });

  it('lleva el evento y un errorType acotado, con el código cuando existe', () => {
    const payload = buildBootstrapFailureLog(
      Object.assign(new Error('password=hunter2'), {
        name: 'DatabaseError',
        code: '08006',
      }),
    );

    expect(payload).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'DatabaseError',
      errorCode: '08006',
    });
    expect(payload.errorType.length).toBeLessThanOrEqual(64);
  });

  it('degrada a un errorType seguro ante valores que no son Error', () => {
    expect(buildBootstrapFailureLog('boom')).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'string',
    });

    const secret = { token: 'do-not-log' };
    const payload = buildBootstrapFailureLog(secret);
    expect(payload).toEqual({
      event: 'api_bootstrap_failed',
      errorType: 'object',
    });
    expect(JSON.stringify(payload)).not.toContain('do-not-log');
  });
});
