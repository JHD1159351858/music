import { TaskDetailManagement } from '@/components/teacher/task-management'

export default async function TeacherTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TaskDetailManagement taskId={id} />
}
