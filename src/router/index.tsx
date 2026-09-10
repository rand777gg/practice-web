import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { OtpGuard } from '@/components/auth/OtpGuard'
import { RootGate } from '@/router/RootGate'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Component as TermsPage } from '@/pages/TermsPage'
import { Component as PrivacyPage } from '@/pages/PrivacyPage'

export const router = createBrowserRouter([
  {
    HydrateFallback: () => <LoadingTips className="h-screen" />,
    children: [
      {
        path: '/terms',
        Component: TermsPage,
      },
      {
        path: '/privacy',
        Component: PrivacyPage,
      },
      {
        path: '/qr-confirm',
        lazy: () => import('@/pages/QrConfirmPage'),
      },
      {
        path: '/welcome',
        lazy: () => import('@/pages/WelcomePage'),
      },
      {
        path: '/guide',
        lazy: () => import('@/pages/GuidePage'),
      },
      {
        path: '/mfa',
        lazy: () => import('@/pages/MfaPage'),
      },
      {
        path: '/mfa/:method',
        lazy: () => import('@/pages/MfaPage'),
      },
      {
        path: '/farewell',
        lazy: () => import('@/pages/FarewellPage'),
      },
      {
        path: '/',
        Component: RootGate,
        children: [
          {
            element: <OtpGuard><AppLayout /></OtpGuard>,
            children: [
              {
                index: true,
                lazy: () => import('@/pages/DashboardPage'),
              },
              {
                path: 'practice',
                lazy: () => import('@/pages/PracticePage'),
              },
              {
                path: 'exam',
                lazy: () => import('@/pages/ExamPage'),
              },
              {
                path: 'exam/appointment',
                lazy: () => import('@/pages/ExamPage'),
              },
              {
                path: 'exam/history',
                lazy: () => import('@/pages/ExamPage'),
              },
              {
                path: 'exam/export',
                lazy: () => import('@/pages/ExamPage'),
              },
              {
                path: 'exam/templates',
                lazy: () => import('@/pages/ExamTemplatesPage'),
              },
              {
                path: 'exam/result/:sessionId',
                lazy: () => import('@/pages/ExamResultPage'),
              },
              {
                path: 'favorites',
                lazy: () => import('@/pages/FavoritesPage'),
              },
              {
                path: 'review',
                lazy: () => import('@/pages/WrongReviewPage'),
              },
              {
                path: 'notes',
                lazy: () => import('@/pages/PublicNotesPage'),
              },
              {
                path: 'question-bank',
                lazy: () => import('@/pages/QuestionBankPage'),
              },
              {
                path: 'learning-routes',
                lazy: () => import('@/pages/LearningRoutesPage'),
              },
              {
                path: 'learning-routes/:routeId',
                lazy: () => import('@/pages/LearningRouteDetailPage'),
              },
              {
                path: 'learning-routes/:routeId/practice',
                lazy: () => import('@/pages/LearningRoutePracticePage'),
              },
              {
                path: 'study-rooms',
                lazy: () => import('@/pages/StudyRoomsPage'),
              },
              {
                path: 'topics',
                lazy: () => import('@/pages/TopicsOverviewPage'),
              },
              {
                path: 'topics/ranking',
                lazy: () => import('@/pages/TopicsOverviewPage'),
              },
              {
                path: 'topics/:topicId',
                lazy: () => import('@/pages/TopicDetailPage'),
              },
              {
                path: 'topics/:topicId/question-bank',
                lazy: () => import('@/pages/TopicDetailPage'),
              },
              {
                path: 'topics/:topicId/literature',
                lazy: () => import('@/pages/TopicDetailPage'),
              },
              {
                path: 'topics/:topicId/legacy',
                lazy: () => import('@/pages/TopicDetailPage'),
              },
              {
                path: 'arena',
                lazy: () => import('@/pages/ArenaPage'),
              },
              {
                path: 'achievements',
                lazy: () => import('@/pages/AchievementsPage'),
              },
              {
                path: 'mentors',
                lazy: () => import('@/pages/MentorsPage'),
              },
              {
                path: 'export',
                lazy: () => import('@/pages/ExportPage'),
              },
              {
                path: 'export/templates',
                lazy: () => import('@/pages/ExportTemplatesPage'),
              },
              {
                path: 'my-bank',
                lazy: () => import('@/pages/MyQuestionBankPage'),
              },
              {
                path: 'templates',
                lazy: () => import('@/pages/TemplatesPage'),
              },
              {
                path: 'templates/:tab',
                lazy: () => import('@/pages/TemplatesPage'),
              },
              {
                path: 'assistant',
                lazy: () => import('@/pages/AssistantPage'),
              },
              {
                path: 'ai',
                lazy: () => import('@/pages/AiSettingsPage'),
              },
              {
                path: 'data-center',
                lazy: () => import('@/pages/DataCenterPage'),
              },
              {
                path: 'feedback',
                lazy: () => import('@/pages/FeedbackPage'),
              },
              {
                path: 'settings',
                lazy: () => import('@/pages/SettingsPage'),
              },
              {
                path: 'judge-local',
                lazy: () => import('@/pages/JudgeLocalGuidePage'),
              },
              {
                path: 'admin',
                element: <ProtectedRoute requiredRole="admin" />,
                children: [
                  {
                    path: 'questions',
                    lazy: () => import('@/pages/admin/QuestionsManagePage'),
                  },
                  {
                    path: 'questions/new',
                    lazy: () => import('@/pages/admin/QuestionCreatePage'),
                  },
                  {
                    path: 'questions/:questionId/edit',
                    lazy: () => import('@/pages/admin/QuestionEditPage'),
                  },
                  {
                    path: 'questions/test',
                    lazy: () => import('@/pages/admin/TestQuestionPage'),
                  },
                  {
                    path: 'duplicates',
                    lazy: () => import('@/pages/admin/DuplicateCheckPage'),
                  },
                  {
                    path: 'ai-import',
                    lazy: () => import('@/pages/admin/AiImportPage'),
                  },
                  {
                    path: 'users',
                    lazy: () => import('@/pages/admin/UsersManagePage'),
                  },
                  {
                    // 旧路径保留，管理员与普通用户共用同一个 AI 设置页
                    path: 'ai',
                    lazy: () => import('@/pages/AiSettingsPage'),
                  },
                  {
                    path: 'crawler',
                    lazy: () => import('@/pages/admin/CrawlerPage'),
                  },
                  {
                    path: 'organize-exam',
                    lazy: () => import('@/pages/admin/OrganizeExamPage'),
                  },
                  {
                    path: 'data-center',
                    lazy: () => import('@/pages/DataCenterPage'),
                  },
                  {
                    path: 'learning-routes',
                    lazy: () => import('@/pages/admin/LearningRoutesManagePage'),
                  },
                  {
                    path: 'learning-routes/new',
                    lazy: () => import('@/pages/admin/LearningRouteEditPage'),
                  },
                  {
                    path: 'learning-routes/:routeId/edit',
                    lazy: () => import('@/pages/admin/LearningRouteEditPage'),
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: '*',
        lazy: () => import('@/pages/NotFoundPage'),
      },
    ],
  },
])
