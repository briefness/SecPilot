interface RequiredWorkflow {
  id: number;
  name: string;
  path: string;
  ref: string;
  repository_id: number;
  repository_name: string;
  repository_html_url: string;
  scope: string;
  selected_repositories_url?: string;
}

interface RequiredWorkflowsList {
  total_count: number;
  required_workflows: RequiredWorkflow[];
}

export class GithubOrgClient {
  private orgName: string;
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor(orgName: string, token: string) {
    this.orgName = orgName;
    this.token = token;
  }

  private async request<T>(
    path: string,
    method: string = 'GET',
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async listRequiredWorkflows(): Promise<RequiredWorkflowsList> {
    return this.request<RequiredWorkflowsList>(
      `/orgs/${this.orgName}/actions/required_workflows`
    );
  }

  async getRequiredWorkflow(requiredWorkflowId: number): Promise<RequiredWorkflow> {
    return this.request<RequiredWorkflow>(
      `/orgs/${this.orgName}/actions/required_workflows/${requiredWorkflowId}`
    );
  }

  async createRequiredWorkflow(params: {
    workflowFilePath: string;
    repositoryId: number;
    scope: string;
    ref?: string;
    selectedRepositoryIds?: number[];
  }): Promise<RequiredWorkflow> {
    return this.request<RequiredWorkflow>(
      `/orgs/${this.orgName}/actions/required_workflows`,
      'POST',
      {
        workflow_file_path: params.workflowFilePath,
        repository_id: params.repositoryId,
        scope: params.scope,
        ref: params.ref || 'main',
        selected_repository_ids: params.selectedRepositoryIds,
      }
    );
  }

  async updateRequiredWorkflow(
    requiredWorkflowId: number,
    params: {
      workflowFilePath?: string;
      repositoryId?: number;
      scope?: string;
      ref?: string;
      selectedRepositoryIds?: number[];
    }
  ): Promise<RequiredWorkflow> {
    return this.request<RequiredWorkflow>(
      `/orgs/${this.orgName}/actions/required_workflows/${requiredWorkflowId}`,
      'PATCH',
      {
        workflow_file_path: params.workflowFilePath,
        repository_id: params.repositoryId,
        scope: params.scope,
        ref: params.ref,
        selected_repository_ids: params.selectedRepositoryIds,
      }
    );
  }

  async deleteRequiredWorkflow(requiredWorkflowId: number): Promise<void> {
    return this.request<void>(
      `/orgs/${this.orgName}/actions/required_workflows/${requiredWorkflowId}`,
      'DELETE'
    );
  }

  async getRepoId(owner: string, repo: string): Promise<number> {
    const data = await this.request<{ id: number }>(`/repos/${owner}/${repo}`);
    return data.id;
  }

  async listOrgRepos(params?: {
    type?: string;
    per_page?: number;
    page?: number;
  }): Promise<Array<{ id: number; name: string; full_name: string; private: boolean }>> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.page) searchParams.set('page', String(params.page));
    const qs = searchParams.toString();
    return this.request<Array<{ id: number; name: string; full_name: string; private: boolean }>>(
      `/orgs/${this.orgName}/repos${qs ? `?${qs}` : ''}`
    );
  }

  async createWorkflowFile(params: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
  }): Promise<{ commit: { sha: string }; content: { path: string } }> {
    const { owner, repo, path, content, message, branch = 'main' } = params;

    let sha: string | undefined;
    try {
      const existing = await this.request<{ sha: string }>(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
      );
      sha = existing.sha;
    } catch {
    }

    return this.request<{ commit: { sha: string }; content: { path: string } }>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      'PUT',
      {
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
      }
    );
  }
}
