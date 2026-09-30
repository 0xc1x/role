import {
  escapeHtml,
  renderBusinessConfirmationEmail,
} from './businesses-confirmation-email';

const LINK =
  'https://test.supabase.co/auth/v1/verify?type=signup&token=hashed123&redirect_to=http%3A%2F%2Flocalhost%3A3001%2F';
/** Same URL as it appears inside the HTML part, where `&` is entity-encoded. */
const LINK_IN_HTML = LINK.replace(/&/g, '&amp;');

describe('renderBusinessConfirmationEmail', () => {
  const input = {
    ownerName: 'Ana Pérez',
    businessName: 'Panadería La Espiga',
    confirmationUrl: LINK,
    supportEmail: 'negocios@role.ec',
  };

  it('returns a Spanish subject naming the business', () => {
    const { subject } = renderBusinessConfirmationEmail(input);
    expect(subject).toBe(
      'Confirma tu cuenta de Rolé para activar el acceso a Panadería La Espiga',
    );
    expect(subject).not.toBe('Confirmación de cuenta');
  });

  it('truncates an overlong business name in the subject', () => {
    const { subject } = renderBusinessConfirmationEmail({
      ...input,
      businessName: 'B'.repeat(200),
    });
    expect(subject.length).toBeLessThan(140);
    expect(subject.endsWith('…')).toBe(true);
  });

  it('renders the owner name and the confirmation link in both parts', () => {
    const { html, text } = renderBusinessConfirmationEmail(input);
    for (const part of [html, text]) {
      expect(part).toContain('Ana Pérez');
      expect(part).toContain('Panadería La Espiga');
    }
    // The link is entity-encoded in the HTML part and raw in the text part.
    expect(html).toContain(LINK_IN_HTML);
    expect(html).toContain(`href="${LINK_IN_HTML}"`);
    expect(text).toContain(LINK);
  });

  it('exposes the link as a button and as a plain-text fallback', () => {
    const { html, text } = renderBusinessConfirmationEmail(input);
    // Bulletproof-button markup (table + bgcolor, no background-image).
    expect(html).toContain('Confirmar mi cuenta en Rolé');
    expect(html).toContain('bgcolor="#371949"');
    expect(html).not.toContain('background-image');
    // Fallback anchor with meaningful text, not "click here".
    expect(html).not.toMatch(/click here|pulsa aquí/i);
    expect(html).toContain('copia esta dirección en tu navegador');
    expect(text).toContain('enlace de un solo uso');
  });

  it('is email-client safe: es-ES, viewport, 600px cap, no external assets', () => {
    const { html } = renderBusinessConfirmationEmail(input);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(html).toContain('max-width:600px');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('<title>Confirma tu cuenta de Rolé</title>');
    expect(html).not.toMatch(/<link\b|<img\b|@import|src=/i);
  });

  it('states the business is still pending approval', () => {
    const { html, text } = renderBusinessConfirmationEmail(input);
    expect(html).toContain('Tu negocio sigue en revisión');
    expect(text).toContain('Tu negocio sigue en revisión');
  });

  // The support inbox is resolved by the caller (app_config), not hardcoded
  // here, and it lands in markup — so it has to render and stay escaped.
  it('renders the support address it receives, in both parts', () => {
    const { html, text } = renderBusinessConfirmationEmail({
      ...input,
      supportEmail: 'soporte@role.ec',
    });

    expect(html).toContain('Escríbenos a <a href="mailto:soporte@role.ec"');
    expect(html).toContain('>soporte@role.ec</a>');
    expect(text).toContain('Escríbenos a soporte@role.ec');
    expect(html).not.toContain('negocios@role.ec');
  });

  it('escapes the support address before it reaches the HTML part', () => {
    const hostile = 'evil"@role.ec?x=<script>alert(1)</script>';
    const { html } = renderBusinessConfirmationEmail({
      ...input,
      supportEmail: hostile,
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<[^>]*onerror/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes interpolated user input instead of emitting markup', () => {
    const xss = '<script>alert("x")</script>';
    const { html, text } = renderBusinessConfirmationEmail({
      ...input,
      ownerName: xss,
      businessName: `Panadería "><img src=x onerror=alert(1)>`,
    });

    // No tag from user input survives; the payload is only ever text.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    // `onerror` may appear as escaped text, but never inside a tag.
    expect(html).not.toMatch(/<[^>]*onerror/i);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    // The plain-text part is not markup, so the raw value is safe there.
    expect(text).toContain(xss);
  });
});

describe('escapeHtml', () => {
  it('encodes the five markup-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves accents and plain text untouched', () => {
    expect(escapeHtml('Panadería La Espiga — Ñandú')).toBe(
      'Panadería La Espiga — Ñandú',
    );
  });
});
