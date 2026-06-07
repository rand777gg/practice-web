import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('@/pages/LoginPage'),
  },
  {
    path: '/register',
    lazy: () => import('@/pages/RegisterPage'),
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
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
                path: 'ai-import',
                lazy: () => import('@/pages/admin/AiImportPage'),
              },
              {
                path: 'users',
                lazy: () => import('@/pages/admin/UsersManagePage'),
              },
              {
                path: 'ai',
                lazy: () => import('@/pages/admin/AiManagePage'),
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
])
