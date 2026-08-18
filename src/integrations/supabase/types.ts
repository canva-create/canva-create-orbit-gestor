export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ativacoes_apps: {
        Row: {
          aplicativo: string | null
          ativado_em: string
          cliente_nome: string | null
          created_at: string
          custo: number
          device: string | null
          dias_validade: number
          expira_em: string
          id: string
          mac: string | null
          observacao: string | null
          servidor_id: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          aplicativo?: string | null
          ativado_em?: string
          cliente_nome?: string | null
          created_at?: string
          custo?: number
          device?: string | null
          dias_validade?: number
          expira_em: string
          id?: string
          mac?: string | null
          observacao?: string | null
          servidor_id?: string | null
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          aplicativo?: string | null
          ativado_em?: string
          cliente_nome?: string | null
          created_at?: string
          custo?: number
          device?: string | null
          dias_validade?: number
          expira_em?: string
          id?: string
          mac?: string | null
          observacao?: string | null
          servidor_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ativacoes_apps_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "servidores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          categoria: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          descricao: string | null
          entidade: string | null
          entidade_id: string | null
          entidade_nome: string | null
          id: string
          metadata: Json | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          acao: string
          categoria: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          descricao?: string | null
          entidade?: string | null
          entidade_id?: string | null
          entidade_nome?: string | null
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          categoria?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          descricao?: string | null
          entidade?: string | null
          entidade_id?: string | null
          entidade_nome?: string | null
          id?: string
          metadata?: Json | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backups: {
        Row: {
          conteudo: Json | null
          created_at: string
          erro_msg: string | null
          exportado_em: string | null
          id: string
          nome: string
          referencia_dia: string
          registros: Json
          status: string
          tamanho_bytes: number
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conteudo?: Json | null
          created_at?: string
          erro_msg?: string | null
          exportado_em?: string | null
          id?: string
          nome: string
          referencia_dia?: string
          registros?: Json
          status?: string
          tamanho_bytes?: number
          tipo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conteudo?: Json | null
          created_at?: string
          erro_msg?: string | null
          exportado_em?: string | null
          id?: string
          nome?: string
          referencia_dia?: string
          registros?: Json
          status?: string
          tamanho_bytes?: number
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          aplicativo: string | null
          created_at: string
          custo_snapshot: number
          data_inicio: string
          data_vencimento: string | null
          deleted_at: string | null
          device: string | null
          id: string
          lembrete_1_dia_antes: boolean
          lembrete_apos: boolean
          lembrete_no_dia: boolean
          lembrete_vencimento: boolean
          mac: string | null
          nome: string
          observacao: string | null
          servidor_id: string | null
          status: Database["public"]["Enums"]["cliente_status"]
          status_pagamento: Database["public"]["Enums"]["pagamento_status"]
          telefone: string | null
          updated_at: string
          user_id: string
          valor_pago: number
        }
        Insert: {
          aplicativo?: string | null
          created_at?: string
          custo_snapshot?: number
          data_inicio?: string
          data_vencimento?: string | null
          deleted_at?: string | null
          device?: string | null
          id?: string
          lembrete_1_dia_antes?: boolean
          lembrete_apos?: boolean
          lembrete_no_dia?: boolean
          lembrete_vencimento?: boolean
          mac?: string | null
          nome: string
          observacao?: string | null
          servidor_id?: string | null
          status?: Database["public"]["Enums"]["cliente_status"]
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          telefone?: string | null
          updated_at?: string
          user_id: string
          valor_pago?: number
        }
        Update: {
          aplicativo?: string | null
          created_at?: string
          custo_snapshot?: number
          data_inicio?: string
          data_vencimento?: string | null
          deleted_at?: string | null
          device?: string | null
          id?: string
          lembrete_1_dia_antes?: boolean
          lembrete_apos?: boolean
          lembrete_no_dia?: boolean
          lembrete_vencimento?: boolean
          mac?: string | null
          nome?: string
          observacao?: string | null
          servidor_id?: string | null
          status?: Database["public"]["Enums"]["cliente_status"]
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          telefone?: string | null
          updated_at?: string
          user_id?: string
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "clientes_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "servidores"
            referencedColumns: ["id"]
          },
        ]
      }
      config_financeira: {
        Row: {
          comissao_revenda_percentual: number | null
          custo_padrao_credito: number | null
          id: string
          regra_proporcional: boolean | null
          updated_at: string | null
          user_id: string
          valor_venda_padrao: number | null
        }
        Insert: {
          comissao_revenda_percentual?: number | null
          custo_padrao_credito?: number | null
          id?: string
          regra_proporcional?: boolean | null
          updated_at?: string | null
          user_id: string
          valor_venda_padrao?: number | null
        }
        Update: {
          comissao_revenda_percentual?: number | null
          custo_padrao_credito?: number | null
          id?: string
          regra_proporcional?: boolean | null
          updated_at?: string | null
          user_id?: string
          valor_venda_padrao?: number | null
        }
        Relationships: []
      }
      creditos_compras: {
        Row: {
          created_at: string
          data_compra: string
          id: string
          observacao: string | null
          quantidade: number
          servidor_id: string
          updated_at: string
          user_id: string
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          data_compra?: string
          id?: string
          observacao?: string | null
          quantidade: number
          servidor_id: string
          updated_at?: string
          user_id: string
          valor_total?: number | null
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          data_compra?: string
          id?: string
          observacao?: string | null
          quantidade?: number
          servidor_id?: string
          updated_at?: string
          user_id?: string
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "creditos_compras_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "servidores"
            referencedColumns: ["id"]
          },
        ]
      }
      creditos_movimentacoes: {
        Row: {
          cliente_id: string | null
          compra_id: string | null
          created_at: string
          id: string
          motivo: string | null
          quantidade: number
          servidor_id: string
          tipo: Database["public"]["Enums"]["credito_mov_tipo"]
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          compra_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          quantidade: number
          servidor_id: string
          tipo: Database["public"]["Enums"]["credito_mov_tipo"]
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          compra_id?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          quantidade?: number
          servidor_id?: string
          tipo?: Database["public"]["Enums"]["credito_mov_tipo"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creditos_movimentacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_movimentacoes_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "creditos_compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_movimentacoes_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "servidores"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          ativo: boolean
          base_calculo: string
          cargo: string | null
          created_at: string
          data_admissao: string | null
          diaria_minima: number
          id: string
          nome: string
          percentual: number
          salario_fixo: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          base_calculo?: string
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          diaria_minima?: number
          id?: string
          nome: string
          percentual?: number
          salario_fixo?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          base_calculo?: string
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          diaria_minima?: number
          id?: string
          nome?: string
          percentual?: number
          salario_fixo?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historico_financeiro: {
        Row: {
          cliente_id: string | null
          created_at: string
          custo: number
          descricao: string | null
          id: string
          lucro: number
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          custo?: number
          descricao?: string | null
          id?: string
          lucro?: number
          tipo: string
          user_id: string
          valor?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          custo?: number
          descricao?: string | null
          id?: string
          lucro?: number
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_financeiro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_renovacoes: {
        Row: {
          cancelado_em: string | null
          cliente_id: string
          created_at: string
          custo: number
          dias_adicionados: number
          id: string
          lucro: number
          pago_em: string | null
          status: string
          status_pagamento: Database["public"]["Enums"]["pagamento_status"]
          user_id: string
          valor_pendente: number
          valor_recebido: number
          vencimento_anterior: string | null
          vencimento_novo: string | null
        }
        Insert: {
          cancelado_em?: string | null
          cliente_id: string
          created_at?: string
          custo?: number
          dias_adicionados?: number
          id?: string
          lucro?: number
          pago_em?: string | null
          status?: string
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          user_id: string
          valor_pendente?: number
          valor_recebido?: number
          vencimento_anterior?: string | null
          vencimento_novo?: string | null
        }
        Update: {
          cancelado_em?: string | null
          cliente_id?: string
          created_at?: string
          custo?: number
          dias_adicionados?: number
          id?: string
          lucro?: number
          pago_em?: string | null
          status?: string
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          user_id?: string
          valor_pendente?: number
          valor_recebido?: number
          vencimento_anterior?: string | null
          vencimento_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_renovacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes: {
        Row: {
          ativo: boolean
          created_at: string
          credenciais: Json
          id: string
          nome: string
          provider: string
          status: string
          ultima_notificacao: string | null
          ultima_sync: string | null
          ultimo_teste_msg: string | null
          ultimo_teste_ok: boolean | null
          updated_at: string
          user_id: string
          webhook_token: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          credenciais?: Json
          id?: string
          nome?: string
          provider: string
          status?: string
          ultima_notificacao?: string | null
          ultima_sync?: string | null
          ultimo_teste_msg?: string | null
          ultimo_teste_ok?: boolean | null
          updated_at?: string
          user_id: string
          webhook_token?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          credenciais?: Json
          id?: string
          nome?: string
          provider?: string
          status?: string
          ultima_notificacao?: string | null
          ultima_sync?: string | null
          ultimo_teste_msg?: string | null
          ultimo_teste_ok?: boolean | null
          updated_at?: string
          user_id?: string
          webhook_token?: string
        }
        Relationships: []
      }
      licencas: {
        Row: {
          ativada_em: string | null
          codigo: string
          created_at: string
          criada_por: string | null
          dados_acesso: string | null
          data_expiracao: string
          dias_duracao: number | null
          dispositivos_permitidos: number
          id: string
          nome_cliente: string | null
          observacoes: string | null
          site_url: string | null
          status: string
          updated_at: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          ativada_em?: string | null
          codigo: string
          created_at?: string
          criada_por?: string | null
          dados_acesso?: string | null
          data_expiracao: string
          dias_duracao?: number | null
          dispositivos_permitidos?: number
          id?: string
          nome_cliente?: string | null
          observacoes?: string | null
          site_url?: string | null
          status?: string
          updated_at?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          ativada_em?: string | null
          codigo?: string
          created_at?: string
          criada_por?: string | null
          dados_acesso?: string | null
          data_expiracao?: string
          dias_duracao?: number | null
          dispositivos_permitidos?: number
          id?: string
          nome_cliente?: string | null
          observacoes?: string | null
          site_url?: string | null
          status?: string
          updated_at?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      licencas_ativacoes: {
        Row: {
          created_at: string
          dispositivo: string | null
          id: string
          licenca_id: string
          user_agent: string | null
          usuario_email: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dispositivo?: string | null
          id?: string
          licenca_id: string
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          dispositivo?: string | null
          id?: string
          licenca_id?: string
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "licencas_ativacoes_licenca_id_fkey"
            columns: ["licenca_id"]
            isOneToOne: false
            referencedRelation: "licencas"
            referencedColumns: ["id"]
          },
        ]
      }
      links_pagamento: {
        Row: {
          created_at: string
          id: string
          link: string
          mensagem: string
          titulo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string
          mensagem?: string
          titulo: string
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          created_at?: string
          id?: string
          link?: string
          mensagem?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      lixeira: {
        Row: {
          dados: Json
          excluido_em: string | null
          id: string
          nome_referencia: string | null
          registro_id: string
          tabela: string
          user_id: string
        }
        Insert: {
          dados: Json
          excluido_em?: string | null
          id?: string
          nome_referencia?: string | null
          registro_id: string
          tabela: string
          user_id: string
        }
        Update: {
          dados?: Json
          excluido_em?: string | null
          id?: string
          nome_referencia?: string | null
          registro_id?: string
          tabela?: string
          user_id?: string
        }
        Relationships: []
      }
      mensagens_rapidas: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          id?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      metas: {
        Row: {
          ano: number
          id: string
          mes: number | null
          nome: string
          periodo: string
          tipo: string
          user_id: string
          valor_objetivo: number
        }
        Insert: {
          ano: number
          id?: string
          mes?: number | null
          nome: string
          periodo: string
          tipo: string
          user_id: string
          valor_objetivo: number
        }
        Update: {
          ano?: number
          id?: string
          mes?: number | null
          nome?: string
          periodo?: string
          tipo?: string
          user_id?: string
          valor_objetivo?: number
        }
        Relationships: []
      }
      paineis_info: {
        Row: {
          created_at: string
          email_cadastrado: string
          id: string
          login: string
          painel_unitv: string
          senha: string
          servidor: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_cadastrado?: string
          id?: string
          login?: string
          painel_unitv?: string
          senha?: string
          servidor?: string
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_cadastrado?: string
          id?: string
          login?: string
          painel_unitv?: string
          senha?: string
          servidor?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      pix_pagamentos: {
        Row: {
          conta_destino: string | null
          created_at: string
          descricao: string | null
          end_to_end_id: string | null
          id: string
          instituicao: string | null
          pagador_documento: string | null
          pagador_nome: string | null
          pago_em: string
          payload: Json | null
          provider: string
          status: string
          transacao_id: string | null
          user_id: string
          valor: number
        }
        Insert: {
          conta_destino?: string | null
          created_at?: string
          descricao?: string | null
          end_to_end_id?: string | null
          id?: string
          instituicao?: string | null
          pagador_documento?: string | null
          pagador_nome?: string | null
          pago_em?: string
          payload?: Json | null
          provider: string
          status?: string
          transacao_id?: string | null
          user_id: string
          valor?: number
        }
        Update: {
          conta_destino?: string | null
          created_at?: string
          descricao?: string | null
          end_to_end_id?: string | null
          id?: string
          instituicao?: string | null
          pagador_documento?: string | null
          pagador_nome?: string | null
          pago_em?: string
          payload?: Json | null
          provider?: string
          status?: string
          transacao_id?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      revendedores: {
        Row: {
          created_at: string
          creditos: number
          custo: number
          data_recarga: string | null
          dias_validade: number
          id: string
          login: string | null
          lucro: number
          nome: string
          observacao: string | null
          senha: string | null
          servidor_id: string | null
          status: Database["public"]["Enums"]["revendedor_status"]
          status_pagamento: Database["public"]["Enums"]["pagamento_status"]
          telefone: string | null
          updated_at: string
          user_id: string
          valor_compra: number
          valor_venda: number
        }
        Insert: {
          created_at?: string
          creditos?: number
          custo?: number
          data_recarga?: string | null
          dias_validade?: number
          id?: string
          login?: string | null
          lucro?: number
          nome: string
          observacao?: string | null
          senha?: string | null
          servidor_id?: string | null
          status?: Database["public"]["Enums"]["revendedor_status"]
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          telefone?: string | null
          updated_at?: string
          user_id: string
          valor_compra?: number
          valor_venda?: number
        }
        Update: {
          created_at?: string
          creditos?: number
          custo?: number
          data_recarga?: string | null
          dias_validade?: number
          id?: string
          login?: string | null
          lucro?: number
          nome?: string
          observacao?: string | null
          senha?: string | null
          servidor_id?: string | null
          status?: Database["public"]["Enums"]["revendedor_status"]
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          telefone?: string | null
          updated_at?: string
          user_id?: string
          valor_compra?: number
          valor_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "revendedores_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "servidores"
            referencedColumns: ["id"]
          },
        ]
      }
      revendedores_movimentacoes: {
        Row: {
          cancelada_em: string | null
          cancelada_por: string | null
          created_at: string
          custo: number
          id: string
          lucro: number
          motivo: string | null
          motivo_cancelamento: string | null
          quantidade: number
          revendedor_id: string
          servidor_id: string | null
          status_pagamento: Database["public"]["Enums"]["pagamento_status"]
          status_venda: string
          tipo: Database["public"]["Enums"]["revendedor_mov_tipo"]
          user_id: string
          valor_pago: number
        }
        Insert: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          created_at?: string
          custo?: number
          id?: string
          lucro?: number
          motivo?: string | null
          motivo_cancelamento?: string | null
          quantidade?: number
          revendedor_id: string
          servidor_id?: string | null
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          status_venda?: string
          tipo: Database["public"]["Enums"]["revendedor_mov_tipo"]
          user_id: string
          valor_pago?: number
        }
        Update: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          created_at?: string
          custo?: number
          id?: string
          lucro?: number
          motivo?: string | null
          motivo_cancelamento?: string | null
          quantidade?: number
          revendedor_id?: string
          servidor_id?: string | null
          status_pagamento?: Database["public"]["Enums"]["pagamento_status"]
          status_venda?: string
          tipo?: Database["public"]["Enums"]["revendedor_mov_tipo"]
          user_id?: string
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "revendedores_movimentacoes_revendedor_id_fkey"
            columns: ["revendedor_id"]
            isOneToOne: false
            referencedRelation: "revendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revendedores_movimentacoes_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "servidores"
            referencedColumns: ["id"]
          },
        ]
      }
      servidores: {
        Row: {
          categoria: Database["public"]["Enums"]["servidor_categoria"]
          created_at: string
          custo_mensal: number
          email_cadastrado: string | null
          id: string
          login: string | null
          nome: string
          observacao: string | null
          painel_unitv: string | null
          senha: string | null
          updated_at: string
          url: string | null
          url2: string | null
          url3: string | null
          url4: string | null
          url5: string | null
          user_id: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["servidor_categoria"]
          created_at?: string
          custo_mensal?: number
          email_cadastrado?: string | null
          id?: string
          login?: string | null
          nome: string
          observacao?: string | null
          painel_unitv?: string | null
          senha?: string | null
          updated_at?: string
          url?: string | null
          url2?: string | null
          url3?: string | null
          url4?: string | null
          url5?: string | null
          user_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["servidor_categoria"]
          created_at?: string
          custo_mensal?: number
          email_cadastrado?: string | null
          id?: string
          login?: string | null
          nome?: string
          observacao?: string | null
          painel_unitv?: string | null
          senha?: string | null
          updated_at?: string
          url?: string | null
          url2?: string | null
          url3?: string | null
          url4?: string | null
          url5?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          cliente_id: string | null
          concluida: boolean | null
          created_at: string | null
          data_hora: string
          descricao: string | null
          id: string
          revendedor_id: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          concluida?: boolean | null
          created_at?: string | null
          data_hora: string
          descricao?: string | null
          id?: string
          revendedor_id?: string | null
          titulo: string
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          concluida?: boolean | null
          created_at?: string | null
          data_hora?: string
          descricao?: string | null
          id?: string
          revendedor_id?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_revendedor_id_fkey"
            columns: ["revendedor_id"]
            isOneToOne: false
            referencedRelation: "revendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ativar_licenca: {
        Args: { _codigo: string; _dispositivo?: string; _user_agent?: string }
        Returns: {
          ativada_em: string | null
          codigo: string
          created_at: string
          criada_por: string | null
          dados_acesso: string | null
          data_expiracao: string
          dias_duracao: number | null
          dispositivos_permitidos: number
          id: string
          nome_cliente: string | null
          observacoes: string | null
          site_url: string | null
          status: string
          updated_at: string
          usuario_email: string | null
          usuario_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "licencas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      creditos_saldos: {
        Args: never
        Returns: {
          saldo: number
          servidor_id: string
        }[]
      }
      excluir_todos_clientes: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      minha_licenca_valida: {
        Args: never
        Returns: {
          ativada_em: string | null
          codigo: string
          created_at: string
          criada_por: string | null
          dados_acesso: string | null
          data_expiracao: string
          dias_duracao: number | null
          dispositivos_permitidos: number
          id: string
          nome_cliente: string | null
          observacoes: string | null
          site_url: string | null
          status: string
          updated_at: string
          usuario_email: string | null
          usuario_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "licencas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      cliente_status: "ativo" | "teste" | "vencido" | "cancelado" | "suspenso"
      credito_mov_tipo:
        | "compra"
        | "ativacao"
        | "renovacao"
        | "ajuste_add"
        | "ajuste_rem"
        | "transferencia"
        | "venda_revendedor"
      lembrete_tipo: "no_dia" | "1_dia_antes" | "vencimento" | "apos"
      pagamento_status: "pago" | "devendo"
      revendedor_mov_tipo: "venda" | "renovacao" | "ajuste_add" | "ajuste_rem"
      revendedor_status: "ativo" | "vencido" | "suspenso"
      servidor_categoria: "IPTV" | "P2P" | "Premium" | "TOP"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      cliente_status: ["ativo", "teste", "vencido", "cancelado", "suspenso"],
      credito_mov_tipo: [
        "compra",
        "ativacao",
        "renovacao",
        "ajuste_add",
        "ajuste_rem",
        "transferencia",
        "venda_revendedor",
      ],
      lembrete_tipo: ["no_dia", "1_dia_antes", "vencimento", "apos"],
      pagamento_status: ["pago", "devendo"],
      revendedor_mov_tipo: ["venda", "renovacao", "ajuste_add", "ajuste_rem"],
      revendedor_status: ["ativo", "vencido", "suspenso"],
      servidor_categoria: ["IPTV", "P2P", "Premium", "TOP"],
    },
  },
} as const
