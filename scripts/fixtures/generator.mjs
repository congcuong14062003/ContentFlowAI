// Test-only protocol data. Never imported by application production code.
export function generatorFixtureOutput(input) {
  const platforms = [...new Set([input.platform, ...input.variantPlatforms])];
  const variations = Array.from({ length: input.variations }, (_, index) => {
    const copy = { title: `Fixture draft ${index + 1}`, hook: 'A useful opening', mainText: 'A draft grounded in the supplied product facts.', cta: 'Learn more', hashtags: ['#Marketing'] };
    const result = { ...copy, visualConcept: 'Show the actual product in context.', platformVariants: platforms.map(platform => ({ platform, ...copy })) };
    if (input.toolId === 'email_marketing') result.email = { subject: 'Product information for your team', preheader: 'Explore the supplied features.' };
    if (input.toolId === 'seo_blog') result.seo = { metaTitle: 'A practical product guide', metaDescription: 'A guide based on verified product information.', outline: ['Context','Features','Next steps'] };
    if (['video_hooks','content_ideas'].includes(input.toolId)) result.items = Array.from({ length: Number(input.params[input.toolId === 'video_hooks' ? 'hookCount' : 'ideaCount']) }, (_, n) => ({ text: `Useful idea ${n + 1}`, angle: 'Explain a supplied benefit' }));
    if (input.toolId === 'tiktok_script') result.scenes = [{ start: 0, end: input.params.durationSeconds, spokenText: 'Introduce the product and its supplied features.', visual: 'Show the product in use.' }];
    if (['weekly_plan','monthly_plan'].includes(input.toolId)) {
      const [year, month] = String(input.params.month ?? '2026-01').split('-').map(Number);
      const days = input.toolId === 'weekly_plan' ? 7 : new Date(Date.UTC(year, month, 0)).getUTCDate();
      result.planEntries = Array.from({ length: days }, (_, n) => ({ day: n + 1, platform: input.platform, topic: 'Explain a sourced feature', objective: 'Help customers understand the product', format: 'Educational post', cta: 'Learn more' }));
    }
    return result;
  });
  return { schemaVersion: 1, warnings: [], variations };
}
export function generatorReference(prompt) {
  const wrapped = JSON.parse(prompt); const line = wrapped.request.split('\n').find(line => line.startsWith('REFERENCE_DATA: '));
  if (!line) throw new Error('Expected generator reference data'); return JSON.parse(line.slice('REFERENCE_DATA: '.length));
}
