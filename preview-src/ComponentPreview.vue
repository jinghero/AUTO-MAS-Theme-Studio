<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const title = computed(() => ({ scripts:'托管管理', plans:'计划管理',emulators:'模拟器管理',queue:'调度队列',scheduler:'调度中心',gamesign:'游戏社区',history:'历史记录','theme-store':'资源商店',settings:'设置' })[route.path.slice(1)] || '组件预览')
const plainTitle = computed(() => ['/gamesign', '/theme-store'].includes(route.path))
const columns = [{ title:'名称',dataIndex:'name' },{ title:'状态',dataIndex:'status' },{ title:'下次运行',dataIndex:'time' },{ title:'操作',key:'action' }]
</script>
<template><div><h1 class="page-title" :class="{ 'plain-title': plainTitle }">{{ title }}</h1><a-card><a-space style="margin-bottom:24px"><a-input placeholder="搜索名称" style="width:240px"/><a-button type="primary">搜索</a-button><a-button>重置</a-button></a-space><a-table :columns="columns" :data-source="[{key:'preview',name:'日常任务（预览示例）',status:'已启用',time:'今天 20:00'}]" :pagination="false"><template #bodyCell="{column,text}"><template v-if="column.key==='action'"><a-button type="link">编辑</a-button><a-button type="link" danger>删除</a-button></template><template v-else>{{ text }}</template></template></a-table></a-card><a-card title="表单与弹出层预览" style="margin-top:24px"><a-space><a-input placeholder="任务名称"/><a-select value="auto" style="width:150px" :options="[{value:'auto',label:'自动运行'},{value:'manual',label:'手动运行'}]"/><a-switch :checked="true"/><a-button type="primary">保存</a-button></a-space></a-card></div></template>
<style scoped>
.page-title {
  margin: 0 0 24px;
  font-size: 32px;
  font-weight: 700;
  background: var(--app-page-title-color, linear-gradient(135deg, var(--ant-color-primary), var(--ant-color-primary-hover)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.plain-title {
  color: var(--app-page-title-color, var(--ant-color-text));
  background: none;
  -webkit-text-fill-color: currentColor;
}
</style>
