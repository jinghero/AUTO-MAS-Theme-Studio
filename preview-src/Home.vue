<script setup lang="ts">
import { ref } from 'vue'
import { BellOutlined, EditOutlined } from '@ant-design/icons-vue'
import HomeCommandCard from './views/home/components/HomeCommandCard.vue'
import HomeQuickActionsCard from './views/home/components/HomeQuickActionsCard.vue'
const selected = ref(['preview-task'])
</script>
<template>
  <div class="home-page">
    <div class="home-header"><h2 class="home-title">你好，欢迎使用 AUTO-MAS</h2><a-space><a-button><EditOutlined />编辑布局</a-button><a-button type="primary" ghost><BellOutlined />查看公告</a-button></a-space></div>
    <div class="home-content">
      <HomeCommandCard v-model:selected-task-ids="selected" :is-bootstrapping="false" command-title="长风破浪会有时，直挂云帆济沧海。" command-author="李白" :scheduler-task-options="[{ label: '日常任务（预览示例）', value: 'preview-task' }]" :scheduler-tasks-loading="false" :scheduler-tasks-unavailable="false" :starting-home-task="false" />
      <HomeQuickActionsCard />
      <a-card title="自动运行状态"><a-row :gutter="24"><a-col :span="8"><a-statistic title="最后运行时间" value="今天 09:00" /></a-col><a-col :span="8"><a-statistic title="运行次数" :value="8" /></a-col><a-col :span="8"><a-statistic title="错误次数" :value="0" /></a-col></a-row></a-card>
    </div>
  </div>
</template>
<style scoped>
.home-page{max-width:1600px;margin:0 auto}.home-header{margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.home-title{margin:0 0 4px;color:var(--ant-color-text);font-size:24px;font-weight:600;letter-spacing:0}.home-content{display:flex;flex-direction:column;gap:24px}
</style>
