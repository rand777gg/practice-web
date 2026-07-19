import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Component as LoginPage } from '@/pages/LoginPage'
import { Component as RegisterPage } from '@/pages/RegisterPage'

export const router = createBrowserRouter([
  {
    HydrateFallback: () => <LoadingTips className="h-screen" />,
    children: [
      {
        path: '/login',
        Component: LoginPage,
      },
      {
        path: '/register',
        Component: RegisterPage,
      },
      {
        path: '/welcome',
        lazy: () => import('@/pages/WelcomePage'),
      },
      {
        path: '/farewell',
        lazy: () => import('@/pages/FarewellPage'),
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
                path: 'settings',
                lazy: () => import('@/pages/SettingsPage'),
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
    ],
  },
])
