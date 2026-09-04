import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));

import { RendererService } from './renderer.service';

describe('RendererService', () => {
  let service: RendererService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RendererService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'UNSUBSCRIBE_SECRET' ? 'test-secret' : '',
            ),
          },
        },
      ],
    }).compile();
    service = module.get(RendererService);
  });

  it('escapa variables HTML pero deja las *_url crudas', () => {
    const out = service.renderVariables(
      '<p>{{nombre}}</p><a href="{{unsubscribe_url}}">baja</a>',
      {
        nombre: '<script>x</script>',
        unsubscribe_url: 'https://x/unsubscribe?t=abc',
      },
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('href="https://x/unsubscribe?t=abc"');
  });

  it('ensambla header + body + footer', () => {
    const html = service.assemble({
      headerHtml: '<header>H</header>',
      bodyHtml: '<main>{{nombre}}</main>',
      footerHtml: '<footer>F</footer>',
      vars: { nombre: 'Ana' },
    });
    expect(html).toContain('<header>H</header>');
    expect(html).toContain('<main>Ana</main>');
    expect(html).toContain('<footer>F</footer>');
  });

  it('token de desuscripción roundtrip y rechazo de falsos', () => {
    const token = service.unsubscribeToken('u-1');
    const signature = token.slice(token.indexOf('.') + 1);
    expect(service.verifyUnsubscribeToken('u-1', signature)).toBe(true);
    expect(service.verifyUnsubscribeToken('u-2', signature)).toBe(false);
  });
});

describe('RendererService.unsubscribeUrl', () => {
  test('construye URL con base configurada', async () => {
    const module = await Test.createTestingModule({
      providers: [
        RendererService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'UNSUBSCRIBE_URL_BASE'
                ? 'https://role.app/baja'
                : 'test-secret',
            ),
          },
        },
      ],
    }).compile();
    const svc = module.get(RendererService);
    expect(svc.unsubscribeUrl('u-1')).toMatch(
      /^https:\/\/role\.app\/baja\?t=u-1\./,
    );
  });
});
