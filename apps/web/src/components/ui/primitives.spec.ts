// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import UiButton from './UiButton.vue'; import UiInput from './UiInput.vue'; import UiSelect from './UiSelect.vue'; import UiTabs from './UiTabs.vue'; import UiDialog from './UiDialog.vue';
import en from '../../locales/en'; import vi from '../../locales/vi';
const plugins = [createI18n({ legacy: false, locale: 'en', messages: { en, vi } })];
afterEach(() => { document.body.innerHTML = ''; });
describe('accessible UI primitives', () => {
  it('prevents repeated action while busy and defaults to a non-submit button', async () => {
    const wrapper = mount(UiButton, { props: { loading: true }, slots: { default: 'Save' } });
    expect(wrapper.attributes('type')).toBe('button'); expect(wrapper.attributes('aria-busy')).toBe('true');
    await wrapper.trigger('click'); expect(wrapper.emitted('click')).toBeUndefined();
  });
  it('associates labels and validation feedback with the input', () => {
    const wrapper = mount(UiInput, { props: { label: 'Email', error: 'Invalid email' } }); const input = wrapper.get('input');
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id')); expect(input.attributes('aria-invalid')).toBe('true');
    expect(wrapper.get(`#${input.attributes('aria-describedby')}`).text()).toBe('Invalid email');
  });
  it('supports keyboard selection and skips disabled options', async () => {
    const wrapper = mount(UiSelect, { props: { label: 'Role', options: [{ value: 'a', label: 'Admin', disabled: true }, { value: 'e', label: 'Editor' }, { value: 'v', label: 'Viewer' }] } });
    const control = wrapper.get('[role=combobox]'); await control.trigger('keydown', { key: 'ArrowDown' }); await control.trigger('keydown', { key: 'ArrowDown' }); await control.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['v']); expect(control.attributes('aria-expanded')).toBe('false');
  });
  it('toggles multiple values without closing the list and Escape closes it', async () => {
    const wrapper = mount(UiSelect, { props: { label: 'Languages', multiple: true, modelValue: [], options: [{ value: 'vi', label: 'Vietnamese' }] } }); const control = wrapper.get('[role=combobox]');
    await control.trigger('keydown', { key: 'ArrowDown' }); await control.trigger('keydown', { key: 'Enter' }); expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['vi']]); expect(control.attributes('aria-expanded')).toBe('true'); await control.trigger('keydown', { key: 'Escape' }); expect(control.attributes('aria-expanded')).toBe('false');
  });
  it('moves focus and selection across tabs with arrows', async () => {
    const wrapper = mount(UiTabs, { attachTo: document.body, props: { label: 'Settings', modelValue: 'one', tabs: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] } });
    await wrapper.findAll('[role=tab]')[0]!.trigger('keydown', { key: 'ArrowRight' }); expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['two']); expect(document.activeElement?.textContent).toBe('Two'); wrapper.unmount();
  });
  it('opens a native modal, handles Escape, and restores trigger focus', async () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const wrapper = mount(UiDialog, { attachTo: document.body, global: { plugins }, props: { title: 'Dialog', modelValue: false } });
    await wrapper.setProps({ modelValue: true }); await Promise.resolve(); expect(wrapper.get('dialog').element.open).toBe(true);
    await wrapper.get('dialog').trigger('cancel'); expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    await wrapper.setProps({ modelValue: false }); await Promise.resolve(); expect(document.activeElement).toBe(trigger); wrapper.unmount();
  });
  it('keeps Vietnamese and English message keys aligned', () => { for (const key of Object.keys(en) as (keyof typeof en)[]) expect(Object.keys(vi[key]).sort()).toEqual(Object.keys(en[key]).sort()); });
});
