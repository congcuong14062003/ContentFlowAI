// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ListField from './ListField.vue';
describe('brand list fields', () => {
  it('preserves trailing newlines while typing and emits normalized array items', async () => {
    const wrapper = mount(ListField, { props: { modelValue: ['First'], label: 'Audiences', 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) } });
    await wrapper.get('textarea').setValue('First\n'); expect(wrapper.get('textarea').element.value).toBe('First\n');
    await wrapper.get('textarea').setValue('First\nSecond'); expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['First', 'Second']]);
    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('textarea').attributes('id'));
    wrapper.unmount();
  });
});
