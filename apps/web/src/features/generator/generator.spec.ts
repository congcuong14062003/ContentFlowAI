// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'; import { mount } from '@vue/test-utils'; import { createI18n } from 'vue-i18n';
import GeneratorForm from './GeneratorForm.vue'; import ResultCards from './ResultCards.vue'; import { newInput, type GeneratorTool, type GeneratorRunRecord } from './generator'; import en from '../../locales/en';
const i18n = () => createI18n({ legacy:false,locale:'en',messages:{en} });
const tool: GeneratorTool = { id:'tiktok_script',name:{en:'TikTok Video Script',vi:'Kịch bản TikTok'},description:{en:'Script',vi:'Kịch bản'},platforms:['tiktok'],maxVariations:3,outputTokens:2200,version:1,fields:[{key:'durationSeconds',type:'number',label:{en:'Duration',vi:'Thời lượng'},required:true,min:15,max:90}] };
describe('generator form and results', () => {
  it('binds task-specific numeric inputs and preserves multiline facts while typing', async () => {
    const wrapper = mount(GeneratorForm,{props:{tool,modelValue:newInput(tool),brands:[],products:[],disabled:false,'onUpdate:modelValue':value=>wrapper.setProps({modelValue:value})},global:{plugins:[i18n()]}});
    await wrapper.get('input[type=number]').setValue('30'); expect(wrapper.props('modelValue').params.durationSeconds).toBe(30);
    const facts=wrapper.findAll('textarea').at(-1)!; await facts.setValue('Fact one\n'); expect(facts.element.value).toBe('Fact one\n'); await facts.setValue('Fact one\nFact two'); expect(wrapper.props('modelValue').verifiedFacts).toEqual(['Fact one','Fact two']); wrapper.unmount();
  });
  it('renders provider text safely and emits real save actions for the selected variation', async () => {
    const variation={title:'Draft',hook:'Opening',mainText:'<img src=x onerror=alert(1)>',cta:'Learn more',hashtags:[],visualConcept:'Product',platformVariants:[]};
    const run={result:{schemaVersion:1,warnings:[],variations:[variation]},drafts:[]} as unknown as GeneratorRunRecord;
    const wrapper=mount(ResultCards,{props:{run,editable:true,busy:false},global:{plugins:[i18n()]}}); expect(wrapper.find('img').exists()).toBe(false); expect(wrapper.text()).toContain('<img');
    await wrapper.findAll('button').find(button=>button.text()==='Save draft')!.trigger('click'); expect(wrapper.emitted('save')).toEqual([[0]]); wrapper.unmount();
  });
});
