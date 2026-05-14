const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TaskVerify API',
    version: '1.1.0',
    description: 'TaskVerify backend API — AI-powered gig task verification with Squad escrow. AI Layer (gemini-3-flash-preview): POST /api/v1/tasks runs deterministic matching then Gemini ranks candidates; POST /api/v1/tasks/:id/submit-proof runs deterministic checks then Gemini evaluates proof against deliverable_spec. All AI decisions fall back to deterministic automatically. Every decision is audit-logged to decision_synthesis_logs. Task status flow: posted → assigned → verified OR flagged_for_dispute → completed (auto 24h) OR complaint_filed OR disputed.',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Service health checks' },
    { name: 'Auth', description: 'Registration, login, JWT tokens' },
    { name: 'Tasks', description: 'Task lifecycle — post, assign, verify (public)' },
    { name: 'Buyer', description: 'Authenticated buyer operations (Bearer token required)' },
    { name: 'Workers', description: 'Worker profiles and stats (public read)' },
    { name: 'Worker Profile', description: 'Authenticated worker self-service — KYC, credit score, loans, insurance (Bearer token required)' },
    { name: 'Admin', description: 'Admin-only management endpoints (Bearer token + admin role required)' },
    { name: 'Webhooks', description: 'Squad and verification webhook callbacks' },
    { name: 'Mock Squad', description: 'Local mock of Squad payment API (non-production only)' },
  ],
  components: {
    schemas: {
      Worker: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          external_id: { type: 'string', nullable: true, example: '8f1d2c5e-5c1d-4ed4-9d21-1c0f4c2f4c10' },
          name: { type: 'string', example: 'Amaka Okafor' },
          email: { type: 'string', format: 'email', example: 'amaka@example.com' },
          phone: { type: 'string', nullable: true, example: '+2348012345678' },
          avatar_url: { type: 'string', nullable: true, example: 'https://example.com/avatar.jpg' },
          skills: { type: 'array', items: { type: 'string' }, example: ['cleaning', 'delivery'] },
          bio: { type: 'string', nullable: true, example: 'Reliable and punctual worker.' },
          primary_location: { type: 'string', example: 'Lagos' },
          latitude: { type: 'number', example: 6.5244 },
          longitude: { type: 'number', example: 3.3792 },
          trust_score: { type: 'number', example: 920 },
          tasks_completed: { type: 'integer', example: 42 },
          tasks_successful: { type: 'integer', example: 40 },
          on_time_rate: { type: 'number', example: 0.96 },
          avg_rating: { type: 'number', example: 4.8 },
          total_earnings: { type: 'number', example: 180000 },
          current_month_earnings: { type: 'number', example: 32000 },
          is_active: { type: 'boolean', example: true },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          task_uuid: { type: 'string', example: '9f1d3f7f-4d55-4bc5-9d67-4f0a8f9e5a2b' },
          title: { type: 'string', example: 'Office cleaning for 2 rooms' },
          description: { type: 'string', example: 'Deep clean and sanitize the office space.' },
          client_name: { type: 'string', nullable: true, example: 'TaskVerify Client' },
          client_email: { type: 'string', nullable: true, example: 'client@example.com' },
          required_skills: { type: 'array', items: { type: 'string' }, example: ['cleaning'] },
          amount_naira: { type: 'number', example: 25000 },
          status: {
            type: 'string',
            enum: ['posted', 'assigned', 'submitted', 'verified', 'flagged_for_dispute', 'completed', 'complaint_filed', 'disputed'],
            example: 'posted',
            description: 'State machine: posted→assigned→verified|flagged_for_dispute→completed(auto 24h)|complaint_filed|disputed',
          },
          task_location: { type: 'string', example: 'Ikeja, Lagos' },
          location_latitude: { type: 'number', example: 6.6018 },
          location_longitude: { type: 'number', example: 3.3515 },
          due_date: { type: 'string', format: 'date-time' },
          deliverable_spec: { type: 'object', nullable: true },
          assigned_worker_id: { type: 'integer', nullable: true, example: 3 },
          assigned_at: { type: 'string', format: 'date-time', nullable: true },
          proof_submission: { type: 'object', nullable: true },
          submitted_at: { type: 'string', format: 'date-time', nullable: true },
          ai_verification_result: { type: 'object', nullable: true },
          verified_at: { type: 'string', format: 'date-time', nullable: true },
          squad_va_account_number: { type: 'string', nullable: true, example: '1234567890' },
          squad_payment_ref: { type: 'string', nullable: true, example: 'SQ-REF-12345' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      EscrowAccount: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          task_id: { type: 'integer', example: 1 },
          squad_va_number: { type: 'string', example: '1234567890' },
          squad_bank_code: { type: 'string', example: '058' },
          squad_bank_name: { type: 'string', example: 'Guaranty Trust Bank' },
          amount_naira: { type: 'number', example: 25000 },
          status: { type: 'string', example: 'pending' },
          funded_at: { type: 'string', format: 'date-time', nullable: true },
          released_to_worker_at: { type: 'string', format: 'date-time', nullable: true },
          refunded_to_client_at: { type: 'string', format: 'date-time', nullable: true },
          last_squad_event: { type: 'string', nullable: true },
          last_squad_event_at: { type: 'string', format: 'date-time', nullable: true },
          squad_webhook_count: { type: 'integer', example: 0 },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      WorkerMatch: {
        type: 'object',
        properties: {
          worker_id: { type: 'integer', example: 3 },
          name: { type: 'string', example: 'Emeka Nwosu' },
          match_score: { type: 'number', example: 92 },
          reasons: { type: 'array', items: { type: 'string' } },
          distance_km: { type: 'number', example: 3.4 },
        },
      },
      TaskVerificationResult: {
        type: 'object',
        properties: {
          verified: { type: 'boolean', example: true },
          confidence: { type: 'number', example: 88 },
          details: { type: 'string', example: 'Proof clearly satisfies the deliverable specification.' },
          flags: {
            type: 'array',
            items: { type: 'string' },
            example: [],
            description: 'Specific concerns or missing items flagged by the AI. Empty if all good.',
          },
        },
      },
      SubmitProofResponse: {
        type: 'object',
        properties: {
          task: { $ref: '#/components/schemas/Task' },
          verification: { $ref: '#/components/schemas/TaskVerificationResult' },
        },
      },
      MockVirtualAccount: {
        type: 'object',
        properties: {
          virtual_account_number: { type: 'string', example: '1234567890' },
          beneficiary_name: { type: 'string', example: 'Mock TaskVerify Escrow' },
          bank_code: { type: 'string', example: '033' },
          bank_name: { type: 'string', example: 'Mocked UBA Bank' },
          customer_identifier: { type: 'string' },
          amount: { type: 'number', example: 25000 },
          merchant_reference: { type: 'string', format: 'uuid' },
        },
      },
      SquadWebhookEvent: {
        type: 'object',
        properties: {
          event_type: { type: 'string', example: 'payment.successful' },
          data: { type: 'object' },
          reference: { type: 'string', example: 'SQ-REF-12345' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Task not found' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: { type: 'object', properties: {
            id: { type: 'integer' }, email: { type: 'string' },
            full_name: { type: 'string' }, role: { type: 'string', enum: ['buyer', 'worker', 'admin'] },
            worker_id: { type: 'integer', nullable: true },
          }},
        },
      },
      CreditScore: {
        type: 'object',
        properties: {
          worker_id: { type: 'integer' },
          credit_score: { type: 'integer', example: 720, description: '0-850 FICO-inspired score' },
          credit_band: { type: 'string', enum: ['poor', 'fair', 'good', 'very_good', 'exceptional'] },
          tier: { type: 'string', enum: ['normal', 'verified'] },
          loan_eligible: { type: 'boolean' },
          insurance_eligible: { type: 'boolean' },
          notes: { type: 'string' },
        },
      },
      WorkerKyc: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          worker_id: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          nin_submitted: { type: 'boolean' },
          bvn_submitted: { type: 'boolean' },
          address_submitted: { type: 'boolean' },
          submitted_at: { type: 'string', format: 'date-time' },
          reviewed_at: { type: 'string', format: 'date-time', nullable: true },
          rejection_reason: { type: 'string', nullable: true },
        },
      },
      WorkerLoan: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          worker_id: { type: 'integer' },
          amount_naira: { type: 'number', example: 50000 },
          purpose: { type: 'string', example: 'Equipment purchase' },
          repayment_months: { type: 'integer', example: 6 },
          credit_score_at_application: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'disbursed', 'repaid', 'defaulted'] },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      WorkerInsurance: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          worker_id: { type: 'integer' },
          insurance_type: { type: 'string', enum: ['health', 'income_protection', 'accident'] },
          coverage_amount_naira: { type: 'number', nullable: true },
          status: { type: 'string', enum: ['pending', 'active', 'rejected', 'cancelled', 'expired'] },
          expires_at: { type: 'string', format: 'date-time', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    requestBodies: {
      CreateTaskRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'description', 'amount_naira', 'task_location', 'due_date', 'deliverable_spec'],
              properties: {
                title: { type: 'string', example: 'Office cleaning for 2 rooms' },
                description: { type: 'string', example: 'Deep clean and sanitize the office space.' },
                client_name: { type: 'string', example: 'TaskVerify Client' },
                client_email: { type: 'string', format: 'email', example: 'client@example.com' },
                required_skills: { type: 'array', items: { type: 'string' }, example: ['cleaning'] },
                amount_naira: { type: 'number', example: 25000 },
                task_location: { type: 'string', example: 'Ikeja, Lagos' },
                location_latitude: { type: 'number', example: 6.6018 },
                location_longitude: { type: 'number', example: 3.3515 },
                due_date: { type: 'string', format: 'date-time' },
                deliverable_spec: { type: 'object', example: { photos_required: true, minimum_photos: 3 } },
              },
            },
          },
        },
      },
      AssignWorkerRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['worker_id'],
              properties: {
                worker_id: { type: 'number', example: 3 },
              },
            },
          },
        },
      },
      SubmitProofRequest: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                files: {
                  type: 'array',
                  items: { type: 'string', format: 'binary' }
                },
                text: { type: 'string' }
              }
            }
          }
        }
      },
      ComplaintRequest: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {},
              description: 'No body required. Files a complaint within the 24-hour verified window.',
            },
          },
        },
      },
      DisputeRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Worker did not complete the job properly.' },
              },
              description: 'Optional dispute reason message (stored for audit, not persisted to DB yet).',
            },
          },
        },
      },
      MockCreateVARequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: { type: 'number', example: 25000 },
                customer_identifier: { type: 'string', example: 'task-42' },
                payment_description: { type: 'string', example: 'Escrow for task 42' },
              },
            },
          },
        },
      },
      MockFundTransferRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['virtual_account_number', 'amount'],
              properties: {
                virtual_account_number: { type: 'string', example: '1234567890' },
                amount: { type: 'number', example: 25000 },
                narration: { type: 'string', example: 'Worker payout for task 42' },
              },
            },
          },
        },
      },
      MockRefundRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['virtual_account_number', 'amount'],
              properties: {
                virtual_account_number: { type: 'string', example: '1234567890' },
                amount: { type: 'number', example: 25000 },
              },
            },
          },
        },
      },
      CreateWorkerRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'primary_location'],
              properties: {
                name: { type: 'string', example: 'Amaka Okafor' },
                email: { type: 'string', format: 'email', example: 'amaka@example.com' },
                phone: { type: 'string', example: '+2348012345678' },
                skills: { type: 'array', items: { type: 'string' }, example: ['cleaning', 'delivery'] },
                bio: { type: 'string', example: 'Reliable and punctual worker.' },
                primary_location: { type: 'string', example: 'Lagos' },
                latitude: { type: 'number', example: 6.5244 },
                longitude: { type: 'number', example: 3.3792 },
                avatar_url: { type: 'string', example: 'https://example.com/avatar.jpg' },
              },
            },
          },
        },
      },
      UpdateWorkerRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                skills: { type: 'array', items: { type: 'string' } },
                bio: { type: 'string' },
                avatar_url: { type: 'string' },
                primary_location: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
              },
            },
          },
        },
      },
      VerificationWebhookRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['task_id', 'verification_result'],
              properties: {
                task_id: { type: 'number', example: 1 },
                verification_result: { type: 'string', example: 'approved' },
                ai_confidence: { type: 'number', example: 92 },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check API health',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    environment: { type: 'string', example: 'development' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'location', in: 'query', schema: { type: 'string' }, required: false },
        ],
        responses: {
          200: {
            description: 'Tasks returned successfully',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create a task',
        requestBody: { $ref: '#/components/requestBodies/CreateTaskRequest' },
        responses: {
          201: {
            description: 'Task created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    task: { $ref: '#/components/schemas/Task' },
                    matches: { type: 'array', items: { $ref: '#/components/schemas/WorkerMatch' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get a task by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Task found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
          404: { description: 'Task not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/tasks/{id}/assign': {
      post: {
        tags: ['Tasks'],
        summary: 'Assign a worker to a task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { $ref: '#/components/requestBodies/AssignWorkerRequest' },
        responses: {
          200: {
            description: 'Task assigned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    task: { $ref: '#/components/schemas/Task' },
                    escrow: { $ref: '#/components/schemas/EscrowAccount' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/tasks/{id}/submit-proof': {
      post: {
        tags: ['Tasks'],
        summary: 'Submit completion proof (triggers AI verification)',
        description: 'Worker submits proof. The deterministic verification engine checks for file presence and GPS proximity, then the AI Decision Synthesizer interprets results. If verified, a 24-hour complaint window opens before payment auto-releases.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { $ref: '#/components/requestBodies/SubmitProofRequest' },
        responses: {
          200: {
            description: 'Proof recorded and AI verification result returned',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SubmitProofResponse' },
              },
            },
          },
          404: { description: 'Task not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          400: { description: 'Missing proof_submission field', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/tasks/{id}/complaint': {
      post: {
        tags: ['Tasks'],
        summary: 'File a complaint (within 24-hour verified window)',
        description: 'Buyer files a complaint after AI has verified the task. Only valid when task status is `verified`. Moves task to `complaint_filed` for human intervention.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { $ref: '#/components/requestBodies/ComplaintRequest' },
        responses: {
          200: {
            description: 'Complaint registered',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Complaint registered for human intervention' },
                    task: { $ref: '#/components/schemas/Task' },
                  },
                },
              },
            },
          },
          400: { description: 'Task not in verified state', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Task not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/tasks/{id}/dispute': {
      post: {
        tags: ['Tasks'],
        summary: 'Manually dispute an AI-flagged task',
        description: 'Worker manually disputes a task that was flagged by the AI as low-confidence. Only valid when task status is `flagged_for_dispute`. Moves task to `disputed`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { $ref: '#/components/requestBodies/DisputeRequest' },
        responses: {
          200: {
            description: 'Dispute filed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Manual dispute filed' },
                    task: { $ref: '#/components/schemas/Task' },
                  },
                },
              },
            },
          },
          400: { description: 'Task not in flagged_for_dispute state', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Task not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/tasks/{id}/status': {
      get: {
        tags: ['Tasks'],
        summary: 'Get task status summary',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Task status returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    status: { type: 'string' },
                    assigned_worker_id: { type: 'integer', nullable: true },
                    submitted_at: { type: 'string', format: 'date-time', nullable: true },
                    verified_at: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workers': {
      get: {
        tags: ['Workers'],
        summary: 'List workers',
        parameters: [
          { name: 'location', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'skill', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'minRating', in: 'query', schema: { type: 'number' }, required: false },
        ],
        responses: {
          200: {
            description: 'Workers returned successfully',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Worker' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Workers'],
        summary: 'Create a worker profile',
        requestBody: { $ref: '#/components/requestBodies/CreateWorkerRequest' },
        responses: {
          201: {
            description: 'Worker created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Worker' },
              },
            },
          },
        },
      },
    },
    '/api/v1/workers/{id}': {
      get: {
        tags: ['Workers'],
        summary: 'Get a worker by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Worker found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Worker' } } } },
          404: { description: 'Worker not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      put: {
        tags: ['Workers'],
        summary: 'Update a worker profile',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { $ref: '#/components/requestBodies/UpdateWorkerRequest' },
        responses: {
          200: {
            description: 'Worker updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Worker' },
              },
            },
          },
        },
      },
    },
    '/api/v1/workers/{id}/stats': {
      get: {
        tags: ['Workers'],
        summary: 'Get worker performance stats',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Worker stats returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tasks_completed: { type: 'integer' },
                    tasks_successful: { type: 'integer' },
                    on_time_rate: { type: 'number' },
                    avg_rating: { type: 'number' },
                    total_earnings: { type: 'number' },
                    current_month_earnings: { type: 'number' },
                    trust_score: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workers/{id}/financial-profile': {
      get: {
        tags: ['Workers', 'Financial Intelligence'],
        summary: 'Get worker AI-driven financial and credit profile',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Financial profile returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    credit_score: { type: 'integer' },
                    loan_eligibility: { type: 'boolean' },
                    recommended_loan: { type: 'number' },
                    insurance_risk_level: { type: 'string' }
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/webhooks/squad': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive Squad payment events',
        description: 'HMAC-SHA256 signature required. Signature is computed over the raw JSON body using SQUAD_WEBHOOK_SECRET.',
        parameters: [
          { name: 'x-squad-signature', in: 'header', required: true, schema: { type: 'string' }, description: 'HMAC-SHA256 signature of raw request body' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SquadWebhookEvent' },
            },
          },
        },
        responses: {
          200: { description: 'Webhook accepted', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'received' } } } } } },
          400: { description: 'Missing signature or body', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          401: { description: 'Invalid signature', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/webhooks/verification': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive external verification results',
        description: 'Accepts an external verification decision and updates the task status to `verified`. Intended for external AI pipeline callbacks.',
        requestBody: { $ref: '#/components/requestBodies/VerificationWebhookRequest' },
        responses: {
          200: {
            description: 'Verification recorded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    task: { $ref: '#/components/schemas/Task' },
                    message: { type: 'string', example: 'Task verification recorded' },
                  },
                },
              },
            },
          },
          400: { description: 'Missing task_id or verification_result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Task not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/mock-squad/virtual-account/create': {
      post: {
        tags: ['Mock Squad'],
        summary: 'Create a mock virtual account (escrow)',
        description: 'Non-production only. Generates a fake 10-digit NUBAN and auto-fires a `virtual_account.funded` webhook after 5 seconds.',
        requestBody: { $ref: '#/components/requestBodies/MockCreateVARequest' },
        responses: {
          200: {
            description: 'Mock virtual account created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'integer', example: 200 },
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Virtual Account created successfully' },
                    data: { $ref: '#/components/schemas/MockVirtualAccount' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/mock-squad/virtual-account/fund-transfer': {
      post: {
        tags: ['Mock Squad'],
        summary: 'Simulate releasing funds to a worker',
        description: 'Non-production only. Transfers the held amount from a mock virtual account to a worker.',
        requestBody: { $ref: '#/components/requestBodies/MockFundTransferRequest' },
        responses: {
          200: {
            description: 'Transfer successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'integer', example: 200 },
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        reference: { type: 'string', format: 'uuid' },
                        amount_transferred: { type: 'number' },
                        status: { type: 'string', example: 'success' },
                        narration: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'Virtual account not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/mock-squad/virtual-account/refund': {
      post: {
        tags: ['Mock Squad'],
        summary: 'Simulate refunding funds to client',
        description: 'Non-production only. Refunds the held amount back to the client from a mock virtual account.',
        requestBody: { $ref: '#/components/requestBodies/MockRefundRequest' },
        responses: {
          200: {
            description: 'Refund successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'integer', example: 200 },
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        reference: { type: 'string', format: 'uuid' },
                        amount_refunded: { type: 'number' },
                        status: { type: 'string', example: 'success' },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'Virtual account not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/webhooks/health': {
      get: {
        tags: ['Webhooks'],
        summary: 'Check webhook service health',
        responses: { 200: { description: 'Webhook service healthy' } },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Register a new user',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password','full_name'], properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          full_name: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['buyer','worker'], default: 'buyer' },
          worker_id: { type: 'integer', description: 'Link to existing worker profile (role=worker only)' },
        }}}}},
        responses: {
          201: { description: 'Registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          409: { description: 'Email already registered' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Login and receive JWT',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password'], properties: {
          email: { type: 'string' }, password: { type: 'string' },
        }}}}},
        responses: {
          200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Invalid credentials' },
        },
      },
    },

    // ── Buyer ───────────────────────────────────────────────────────────────
    '/api/v1/buyer/tasks': {
      get: { tags: ['Buyer'], summary: 'List my tasks (with escrow status)', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Task list' }, 401: { description: 'Unauthorized' } } },
      post: { tags: ['Buyer'], summary: 'Create a task and get AI worker matches', security: [{ BearerAuth: [] }],
        requestBody: { $ref: '#/components/requestBodies/CreateTaskRequest' },
        responses: { 201: { description: 'Task created with AI matches' }, 400: { description: 'Missing fields' } } },
    },
    '/api/v1/buyer/tasks/{id}': {
      get: { tags: ['Buyer'], summary: 'Get my task by ID', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Task detail' }, 404: { description: 'Not found or not yours' } } },
    },
    '/api/v1/buyer/tasks/{id}/assign': {
      post: { tags: ['Buyer'], summary: 'Assign worker → creates Squad escrow VA', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['worker_id'], properties: { worker_id: { type: 'integer' } } } } } },
        responses: { 200: { description: 'Worker assigned, escrow VA created' } } },
    },
    '/api/v1/buyer/tasks/{id}/dispute': {
      post: { tags: ['Buyer'], summary: 'File a dispute (during 24h window)', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['reason'], properties: {
          reason: { type: 'string' }, evidence: { type: 'array', items: { type: 'string', format: 'binary' } },
        } } } } },
        responses: { 200: { description: 'Dispute filed' }, 400: { description: 'Window expired or invalid state' } } },
    },
    '/api/v1/buyer/tasks/{id}/release-funds': {
      post: { tags: ['Buyer'], summary: 'Manually release funds early (bypass 24h window)', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Funds released' } } },
    },
    '/api/v1/buyer/tasks/{id}/dispute-window': {
      get: { tags: ['Buyer'], summary: 'Check remaining time in dispute window', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Window status with seconds_remaining' } } },
    },
    '/api/v1/buyer/disputes': {
      get: { tags: ['Buyer'], summary: 'List all my filed disputes', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Dispute list' } } },
    },

    // ── Worker Profile (authenticated worker self-service) ───────────────────
    '/api/v1/worker-profile/me': {
      get: { tags: ['Worker Profile'], summary: 'My full worker profile + tier + credit score', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Worker profile with credit_score, credit_band, tier' } } },
    },
    '/api/v1/worker-profile/me/credit-score': {
      get: { tags: ['Worker Profile'], summary: 'Detailed credit score breakdown and eligibility', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Credit score', content: { 'application/json': { schema: { $ref: '#/components/schemas/CreditScore' } } } } } },
    },
    '/api/v1/worker-profile/me/kyc': {
      get: { tags: ['Worker Profile'], summary: 'Get my KYC status', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'KYC record or {status: not_submitted}' } } },
      post: {
        tags: ['Worker Profile'], summary: 'Submit KYC (NIN + BVN + address)', security: [{ BearerAuth: [] }],
        description: 'NIN and BVN are hashed (MD5) before storage. Both must be exactly 11 digits.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object',
          required: ['nin','bvn','address_line1','city','state'],
          properties: {
            nin: { type: 'string', example: '12345678901', description: '11-digit National Identification Number' },
            bvn: { type: 'string', example: '22345678901', description: '11-digit Bank Verification Number' },
            address_line1: { type: 'string' }, address_line2: { type: 'string' },
            city: { type: 'string' }, state: { type: 'string' }, country: { type: 'string', default: 'Nigeria' },
          },
        }}}},
        responses: {
          201: { description: 'KYC submitted, pending admin review' },
          400: { description: 'Validation error' },
          409: { description: 'KYC already pending or approved' },
        },
      },
    },
    '/api/v1/worker-profile/me/loans': {
      get: { tags: ['Worker Profile'], summary: 'My loan applications', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Loan list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/WorkerLoan' } } } } } } },
      post: {
        tags: ['Worker Profile'], summary: 'Apply for a loan (verified tier + credit score ≥580 required)', security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['amount_naira','purpose'], properties: {
          amount_naira: { type: 'number', example: 50000 },
          purpose: { type: 'string', example: 'Buy work equipment' },
          repayment_months: { type: 'integer', default: 6 },
        }}}}},
        responses: {
          201: { description: 'Loan application submitted' },
          403: { description: 'Not verified or credit score too low' },
          409: { description: 'Active loan already exists' },
        },
      },
    },
    '/api/v1/worker-profile/me/insurance': {
      get: { tags: ['Worker Profile'], summary: 'My insurance policies', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Insurance list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/WorkerInsurance' } } } } } } },
      post: {
        tags: ['Worker Profile'], summary: 'Apply for insurance (verified tier + credit score ≥580 required)', security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['insurance_type'], properties: {
          insurance_type: { type: 'string', enum: ['health','income_protection','accident'] },
          coverage_amount_naira: { type: 'number', example: 500000 },
        }}}}},
        responses: {
          201: { description: 'Insurance application submitted' },
          403: { description: 'Not verified or credit score too low' },
          409: { description: 'Active policy of this type already exists' },
        },
      },
    },

    // ── Admin ───────────────────────────────────────────────────────────────
    '/api/v1/admin/dashboard': {
      get: { tags: ['Admin'], summary: 'Platform stats dashboard', security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Aggregated platform metrics' } } },
    },
    '/api/v1/admin/users': {
      get: { tags: ['Admin'], summary: 'List all users (paginated, filterable)', security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['admin','buyer','worker'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'User list' } } },
      post: { tags: ['Admin'], summary: 'Create a user (any role)', security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password','full_name'], properties: {
          email: { type: 'string' }, password: { type: 'string' }, full_name: { type: 'string' },
          role: { type: 'string', enum: ['admin','buyer','worker'], default: 'buyer' },
          worker_id: { type: 'integer' },
        }}}}},
        responses: { 201: { description: 'User created' }, 409: { description: 'Email exists' } } },
    },
    '/api/v1/admin/users/{id}': {
      get: { tags: ['Admin'], summary: 'Get user by ID', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'User detail' }, 404: { description: 'Not found' } } },
      patch: { tags: ['Admin'], summary: 'Update user (role, is_active, full_name, phone)', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          role: { type: 'string', enum: ['admin','buyer','worker'] }, is_active: { type: 'boolean' },
          full_name: { type: 'string' }, phone: { type: 'string' },
        }}}}},
        responses: { 200: { description: 'Updated user' } } },
      delete: { tags: ['Admin'], summary: 'Soft-deactivate user', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'User deactivated' } } },
    },
    '/api/v1/admin/tasks': {
      get: { tags: ['Admin'], summary: 'All tasks with worker+buyer+escrow joined', security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Task list' } } },
    },
    '/api/v1/admin/tasks/{id}': {
      get: { tags: ['Admin'], summary: 'Full task detail', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Task detail with escrow' } } },
    },
    '/api/v1/admin/tasks/{id}/status': {
      patch: { tags: ['Admin'], summary: 'Force-set task status + resolution note', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: {
          status: { type: 'string', enum: ['posted','assigned','funded','verified','completed','buyer_disputed','complaint_filed','disputed','cancelled','refunded'] },
          admin_resolution: { type: 'string' },
        }}}}},
        responses: { 200: { description: 'Task updated' } } },
    },
    '/api/v1/admin/tasks/{id}/release-funds': {
      post: { tags: ['Admin'], summary: 'Admin force-releases funds to worker', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Funds released' } } },
    },
    '/api/v1/admin/tasks/{id}/refund': {
      post: { tags: ['Admin'], summary: 'Admin force-refunds buyer', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Buyer refunded' } } },
    },
    '/api/v1/admin/tasks/{id}/extend-dispute-window': {
      post: { tags: ['Admin'], summary: 'Extend buyer dispute window', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { hours: { type: 'integer', default: 24 } } } } } },
        responses: { 200: { description: 'Window extended' } } },
    },
    '/api/v1/admin/disputes': {
      get: { tags: ['Admin'], summary: 'List all disputes', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['open','resolved_worker','resolved_buyer','escalated'] } }],
        responses: { 200: { description: 'Dispute list' } } },
    },
    '/api/v1/admin/disputes/{id}': {
      get: { tags: ['Admin'], summary: 'Dispute detail with proof + AI result', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Dispute detail' } } },
    },
    '/api/v1/admin/disputes/{id}/resolve': {
      patch: { tags: ['Admin'], summary: 'Resolve dispute (resolved_worker → complete | resolved_buyer → refund)', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['resolution'], properties: {
          resolution: { type: 'string', enum: ['resolved_worker','resolved_buyer','escalated'] },
          resolution_note: { type: 'string' },
        }}}}},
        responses: { 200: { description: 'Dispute resolved' } } },
    },
    '/api/v1/admin/workers': {
      get: { tags: ['Admin'], summary: 'All workers with trust scores and assigned_tasks count', security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'is_active', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Worker list' } } },
    },
    '/api/v1/admin/workers/{id}': {
      patch: { tags: ['Admin'], summary: 'Update worker trust_score, is_active, skills, bio', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          trust_score: { type: 'integer' }, is_active: { type: 'boolean' },
          skills: { type: 'array', items: { type: 'string' } }, bio: { type: 'string' },
        }}}}},
        responses: { 200: { description: 'Worker updated' } } },
    },
    '/api/v1/admin/escrow': {
      get: { tags: ['Admin'], summary: 'All escrow accounts', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending','funded','released','refunded','frozen'] } }],
        responses: { 200: { description: 'Escrow list' } } },
    },
    '/api/v1/admin/escrow/{id}/status': {
      patch: { tags: ['Admin'], summary: 'Override escrow status', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: {
          status: { type: 'string', enum: ['pending','funded','released','refunded','frozen'] },
        }}}}},
        responses: { 200: { description: 'Escrow updated' } } },
    },
    '/api/v1/admin/kyc': {
      get: { tags: ['Admin'], summary: 'All KYC submissions', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending','approved','rejected'] } }],
        responses: { 200: { description: 'KYC list' } } },
    },
    '/api/v1/admin/kyc/{id}': {
      get: { tags: ['Admin'], summary: 'KYC submission detail', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'KYC detail' } } },
    },
    '/api/v1/admin/kyc/{id}/review': {
      patch: { tags: ['Admin'], summary: 'Approve or reject KYC. Approval upgrades worker tier to verified.', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['decision'], properties: {
          decision: { type: 'string', enum: ['approved','rejected'] },
          rejection_reason: { type: 'string', description: 'Required when decision=rejected' },
        }}}}},
        responses: { 200: { description: 'KYC reviewed. On approval, worker.tier set to verified.' } } },
    },
    '/api/v1/admin/loans': {
      get: { tags: ['Admin'], summary: 'All loan applications', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending','approved','rejected','disbursed','repaid','defaulted'] } }],
        responses: { 200: { description: 'Loan list' } } },
    },
    '/api/v1/admin/loans/{id}': {
      get: { tags: ['Admin'], summary: 'Loan detail', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Loan detail' } } },
    },
    '/api/v1/admin/loans/{id}/review': {
      patch: { tags: ['Admin'], summary: 'Approve or reject loan application', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['decision'], properties: {
          decision: { type: 'string', enum: ['approved','rejected'] },
          admin_note: { type: 'string' }, rejection_reason: { type: 'string' },
        }}}}},
        responses: { 200: { description: 'Loan reviewed' } } },
    },
    '/api/v1/admin/loans/{id}/disburse': {
      patch: { tags: ['Admin'], summary: 'Mark approved loan as disbursed', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Loan disbursed' }, 404: { description: 'Not found or not in approved state' } } },
    },
    '/api/v1/admin/insurance': {
      get: { tags: ['Admin'], summary: 'All insurance applications', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending','active','rejected','cancelled','expired'] } }],
        responses: { 200: { description: 'Insurance list' } } },
    },
    '/api/v1/admin/insurance/{id}': {
      get: { tags: ['Admin'], summary: 'Insurance detail', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Insurance detail' } } },
    },
    '/api/v1/admin/insurance/{id}/review': {
      patch: { tags: ['Admin'], summary: 'Approve (active) or reject insurance application', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['decision'], properties: {
          decision: { type: 'string', enum: ['active','rejected'] },
          admin_note: { type: 'string' }, rejection_reason: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time', description: 'Default: 1 year from now' },
        }}}}},
        responses: { 200: { description: 'Insurance reviewed' } } },
    },
    '/api/v1/admin/ai-logs': {
      get: { tags: ['Admin'], summary: 'Recent AI decision synthesis logs', security: [{ BearerAuth: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }],
        responses: { 200: { description: 'AI log entries' } } },
    },
    '/api/v1/admin/audit-logs': {
      get: { tags: ['Admin'], summary: 'Paginated admin audit trail', security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'actor_id', in: 'query', schema: { type: 'integer' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { 200: { description: 'Audit log entries' } } },
    },
  },
};

export default openapiSpec;