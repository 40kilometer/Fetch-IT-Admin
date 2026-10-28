const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function harness() {
  const slots = []; let cursor = 0;
  const react = { ...React, useId: () => 'workspace', useRef: initial => {
    const index = cursor++; return slots[index] ??= { current: initial };
  }, useState: initial => {
    const index = cursor++; if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; }];
  } };
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync('src/components/workspace-tabs.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, name => name === 'react' ? react : require(name));
  return props => { cursor = 0; return exports.WorkspaceTabs(props); };
}
function parts(tree) {
  const [list, panels] = tree.props.children;
  return { tabs: list.props.children, panels };
}
test('switching tasks hides inactive forms without replacing them or losing their draft', () => {
  const render = harness();
  const draft = React.createElement('textarea', { defaultValue: 'Unfinished evidence' });
  const props = { label: 'Case work', defaultValue: 'review', items: [{ id: 'review', label: 'Review', content: draft }, { id: 'history', label: 'History', content: 'Saved audit event' }] };
  let { tabs, panels } = parts(render(props));
  assert.equal(panels[0].props.hidden, false); assert.equal(panels[1].props.hidden, true);
  tabs[1].props.onClick();
  ({ tabs, panels } = parts(render(props)));
  assert.equal(panels[0].props.hidden, true); assert.equal(panels[0].props.children, draft);
  assert.equal(panels[1].props.hidden, false); assert.equal(tabs[1].props['aria-selected'], true);
  assert.equal(tabs[1].props['aria-controls'], panels[1].props.id);
  tabs[0].props.onClick();
  assert.equal(parts(render(props)).panels[0].props.children, draft);
});
test('keyboard navigation wraps, moves focus, and keeps only the active tab in the tab order', () => {
  const render = harness(), selected = [], props = { label: 'Application stages', onChange: id => selected.push(id), items: ['review', 'orientation', 'history'].map(id => ({ id, label: id, content: id })) };
  let { tabs } = parts(render(props)); let focused;
  tabs.forEach((tab, index) => tab.props.ref({ focus() { focused = index; } }));
  tabs[0].props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
  ({ tabs } = parts(render(props)));
  assert.equal(focused, 2); assert.equal(selected.at(-1), 'history');
  assert.deepEqual(tabs.map(tab => tab.props.tabIndex), [-1, -1, 0]);
  tabs[2].props.onKeyDown({ key: 'Home', preventDefault() {} });
  assert.equal(focused, 0); assert.equal(parts(render(props)).tabs[0].props['aria-selected'], true);
});
