interface ComplianceFramework {
  id: number;
  name: string;
  description?: string;
  color?: string;
  default?: boolean;
  pipeline_configuration_full_path?: string;
}

interface ComplianceFrameworkList {
  data: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
    default?: boolean;
    pipeline_configuration_full_path?: string;
  }>;
}

interface Project {
  id: number;
  name: string;
  path_with_namespace: string;
  compliance_frameworks?: Array<{ id: number; name: string }>;
}

export class GitlabGroupClient {
  private groupPath: string;
  private token: string;
  private baseUrl: string;

  constructor(groupPath: string, token: string, baseUrl: string = 'https://gitlab.com') {
    this.groupPath = encodeURIComponent(groupPath);
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    path: string,
    method: string = 'GET',
    body?: unknown,
    useGraphql: boolean = false
  ): Promise<T> {
    let url = `${this.baseUrl}/api/v4${path}`;
    let reqBody = body;

    if (useGraphql) {
      url = `${this.baseUrl}/api/graphql`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
      body: reqBody ? JSON.stringify(reqBody) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitLab API ${method} ${path} failed: ${res.status} ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async listComplianceFrameworks(): Promise<ComplianceFramework[]> {
    const result = await this.request<ComplianceFrameworkList>(
      `/groups/${this.groupPath}/compliance_frameworks`,
      'GET',
      undefined
    );
    return (result?.data || []).map((f) => ({
      id: parseInt(f.id, 10),
      name: f.name,
      description: f.description,
      color: f.color,
      default: f.default,
      pipeline_configuration_full_path: f.pipeline_configuration_full_path,
    }));
  }

  async createComplianceFramework(params: {
    name: string;
    description?: string;
    color?: string;
    default?: boolean;
    pipelineConfigurationFullPath?: string;
  }): Promise<ComplianceFramework> {
    const variables: Record<string, unknown> = {
      namespace_path: this.groupPath,
      parameters: {
        name: params.name,
        description: params.description,
        color: params.color || '#6699cc',
        default: params.default || false,
        pipeline_configuration_full_path: params.pipelineConfigurationFullPath,
      },
    };

    const query = `
      mutation createComplianceFramework($namespace_path: ID!, $parameters: ComplianceFrameworkCreateInput!) {
        createComplianceFramework(input: {
          namespace_path: $namespace_path,
          parameters: $parameters
        }) {
          framework {
            id
            name
            description
            color
            default
            pipeline_configuration_full_path
          }
          errors
        }
      }
    `;

    const result = await this.request<any>(
      '',
      'POST',
      { query, variables },
      true
    );

    const framework = result?.data?.createComplianceFramework?.framework;
    const errors = result?.data?.createComplianceFramework?.errors;

    if (!framework || (errors && errors.length > 0)) {
      throw new Error(`Failed to create compliance framework: ${JSON.stringify(errors || result)}`);
    }

    return {
      id: parseInt(framework.id.split('/').pop() || '0', 10),
      name: framework.name,
      description: framework.description,
      color: framework.color,
      default: framework.default,
      pipeline_configuration_full_path: framework.pipeline_configuration_full_path,
    };
  }

  async updateComplianceFramework(
    frameworkId: string,
    params: {
      name?: string;
      description?: string;
      color?: string;
      default?: boolean;
      pipelineConfigurationFullPath?: string;
    }
  ): Promise<ComplianceFramework> {
    const variables: Record<string, unknown> = {
      framework_id: frameworkId,
      parameters: {},
    };

    if (params.name !== undefined) (variables.parameters as any).name = params.name;
    if (params.description !== undefined) (variables.parameters as any).description = params.description;
    if (params.color !== undefined) (variables.parameters as any).color = params.color;
    if (params.default !== undefined) (variables.parameters as any).default = params.default;
    if (params.pipelineConfigurationFullPath !== undefined) {
      (variables.parameters as any).pipeline_configuration_full_path = params.pipelineConfigurationFullPath;
    }

    const query = `
      mutation updateComplianceFramework($framework_id: ID!, $parameters: ComplianceFrameworkUpdateInput!) {
        updateComplianceFramework(input: {
          id: $framework_id,
          parameters: $parameters
        }) {
          framework {
            id
            name
            description
            color
            default
            pipeline_configuration_full_path
          }
          errors
        }
      }
    `;

    const result = await this.request<any>(
      '',
      'POST',
      { query, variables },
      true
    );

    const framework = result?.data?.updateComplianceFramework?.framework;
    const errors = result?.data?.updateComplianceFramework?.errors;

    if (!framework || (errors && errors.length > 0)) {
      throw new Error(`Failed to update compliance framework: ${JSON.stringify(errors || result)}`);
    }

    return {
      id: parseInt(framework.id.split('/').pop() || '0', 10),
      name: framework.name,
      description: framework.description,
      color: framework.color,
      default: framework.default,
      pipeline_configuration_full_path: framework.pipeline_configuration_full_path,
    };
  }

  async deleteComplianceFramework(frameworkId: string): Promise<void> {
    const query = `
      mutation destroyComplianceFramework($framework_id: ID!) {
        destroyComplianceFramework(input: { id: $framework_id }) {
          errors
        }
      }
    `;

    const result = await this.request<any>(
      '',
      'POST',
      { query, variables: { framework_id: frameworkId } },
      true
    );

    const errors = result?.data?.destroyComplianceFramework?.errors;
    if (errors && errors.length > 0) {
      throw new Error(`Failed to delete compliance framework: ${JSON.stringify(errors)}`);
    }
  }

  async assignProjectComplianceFramework(projectId: number, frameworkId: string): Promise<void> {
    const query = `
      mutation projectComplianceFrameworkAssign($project_id: ProjectID!, $framework_id: ComplianceFrameworkID!) {
        projectComplianceFrameworkAssign(input: {
          project_id: $project_id,
          compliance_framework_id: $framework_id
        }) {
          project {
            id
            name
          }
          errors
        }
      }
    `;

    const result = await this.request<any>(
      '',
      'POST',
      { query, variables: { project_id: String(projectId), framework_id: frameworkId } },
      true
    );

    const errors = result?.data?.projectComplianceFrameworkAssign?.errors;
    if (errors && errors.length > 0) {
      throw new Error(`Failed to assign compliance framework: ${JSON.stringify(errors)}`);
    }
  }

  async createPipelineFile(params: {
    projectId: string | number;
    path: string;
    content: string;
    branch?: string;
    commitMessage?: string;
  }): Promise<void> {
    const { projectId, path, content, branch = 'main', commitMessage = 'Add security compliance pipeline' } = params;

    try {
      await this.request<void>(
        `/projects/${encodeURIComponent(String(projectId))}/repository/files/${encodeURIComponent(path)}`,
        'POST',
        {
          branch,
          content,
          commit_message: commitMessage,
        }
      );
    } catch (error: any) {
      if (error.message?.includes('400') || error.message?.includes('exists')) {
        await this.request<void>(
          `/projects/${encodeURIComponent(String(projectId))}/repository/files/${encodeURIComponent(path)}`,
          'PUT',
          {
            branch,
            content,
            commit_message: commitMessage,
          }
        );
      } else {
        throw error;
      }
    }
  }

  async listGroupProjects(params?: {
    page?: number;
    perPage?: number;
    search?: string;
  }): Promise<Project[]> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.perPage) searchParams.set('per_page', String(params.perPage));
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();

    return this.request<Project[]>(
      `/groups/${this.groupPath}/projects${qs ? `?${qs}` : ''}`
    );
  }

  async getGroup(): Promise<{ id: number; name: string; path: string; full_path: string }> {
    return this.request<{ id: number; name: string; path: string; full_path: string }>(
      `/groups/${this.groupPath}`
    );
  }
}
