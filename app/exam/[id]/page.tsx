import ExamClient from './exam-client'

export default async function ExamPage(props: PageProps<'/exam/[id]'>) {
  return <ExamClient id={(await props.params).id} />
}
