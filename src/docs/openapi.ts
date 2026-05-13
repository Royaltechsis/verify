const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TaskVerify API',
    version: '1.0.0',
    description: 'TaskVerify backend API for task management, worker matching, escrow, and webhooks.',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Service health and availability checks' },
    { name: 'Tasks', description: 'Task lifecycle operations' },
    { name: 'Workers', description: 'Worker profiles and performance metrics' },
    { name: 'Webhooks', description: 'Squad and verification webhook callbacks' },
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
          status: { type: 'string', example: 'posted' },
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
          details: { type: 'string', example: 'Proof matches the deliverable requirements.' },
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
          'application/json': {
            schema: {
              type: 'object',
              required: ['proof_submission'],
              properties: {
                proof_submission: { type: 'object', example: { photos: ['https://example.com/photo1.jpg'] } },
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
        summary: 'Submit completion proof',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { $ref: '#/components/requestBodies/SubmitProofRequest' },
        responses: {
          200: {
            description: 'Proof recorded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
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
    '/api/v1/webhooks/squad': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive Squad payment events',
        parameters: [
          { name: 'x-squad-signature', in: 'header', required: false, schema: { type: 'string' }, description: 'HMAC signature for webhook validation' },
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
          200: { description: 'Webhook accepted' },
          401: { description: 'Invalid signature', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/v1/webhooks/verification': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive verification results',
        requestBody: { $ref: '#/components/requestBodies/VerificationWebhookRequest' },
        responses: {
          200: {
            description: 'Verification recorded',
          },
        },
      },
    },
    '/api/v1/webhooks/health': {
      get: {
        tags: ['Webhooks'],
        summary: 'Check webhook service health',
        responses: {
          200: {
            description: 'Webhook service healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'webhook service healthy' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export default openapiSpec;